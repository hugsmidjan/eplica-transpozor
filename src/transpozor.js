var transpozor;
var plugins = [];
var pluginsById = {};
var widgets = [];

var events = {
  start: [],
  end: [],
};

// Element#matches normalization.
var ep = Element.prototype;
// Don't use `ep.is` to avoid invoking rollup's tree-shaking/dead-code-removal
Element.prototype.is = ep.matches || ep.msMatchesSelector || ep.webkitMatchesSelector;

var $ = function (selector, elm) {
  elm  = elm || document;
  return !selector ? [] : [].slice.call( elm.querySelectorAll(selector) );
};


var defaultParseData = function (elm) {
  return JSON.parse( elm.getAttribute('data-transpozor') ) || {};
};

var createWidget = function (plugin, elm, editElm, isInserting) {
  var data = (plugin.parseData||defaultParseData)(elm, editElm, isInserting);
  var wrapperElm = document.createElement('div');
  wrapperElm.setAttribute('data-transpozor-wrapper', '');

  wrapperElm.addEventListener('paste', function(e){
    if ( e.target.is('input, textarea') ) {
      e.stopPropagation();
    }
    else {
      // Problem:
      // The inline-editor seems to always inject HTML into the current
      // selectionRange with an offset relative to the editElm –
      // not taking into account the possibility that contentEditable elements
      // might be nested.
      //
      // Solution:
      // Before a paste event reaches the editElm's special paste event-handler
      // turn off the contentEditable lock/scoping for just long enough
      // for the paste event (and it's behind the scenes capture, cleanup etc.)
      // to run its course and the inline-editor to inject the pasted content
      // into place.
      wrapperElm.contentEditable = true;
      setTimeout(function(){
        wrapperElm.contentEditable = false;
      }, 500);
    }
  }, true);
  // Problem:
  // Similar as with the paste event above.
  // Inline-editor toolbar actions/buttons inject HTML snippets
  // into the editElm and fail if the current selectionRange
  // (caret position) is inside a nested contedEditable element.
  //
  // Solution:
  // Toolbar clicks inherently blur the editElm so we make the
  // contentEditable lock/scoping off-by-default and only
  // turn it on while editElm has focus.
  var isExternallySourced = function (e) {
    return  (
      !e.relatedTarget ||
      ( !e.relatedTarget.contains(e.target) &&
        !e.target.contains(e.relatedTarget)
      )
    );
  };
  var lockWrapperElm = function(e){
    if (wrapperElm.contedEditable !== 'false' && isExternallySourced(e) ) {
      wrapperElm.contentEditable = false;
    }
  };
  var unlockWrapperElm = function(e){
    if (wrapperElm.contedEditable !== 'true' && isExternallySourced(e) ) {
      wrapperElm.contentEditable = true;
    }
  };
  // Preempt the focus event when user enters the wrapper directly –
  // because otherwise flipping the contenteditable switch causes an
  // instant blur on editElm and no re-focus on the nested
  // contendEditable element.
  wrapperElm.addEventListener('mousedown', lockWrapperElm, true);
  wrapperElm.addEventListener('touchstart', lockWrapperElm, true);
  // NOTE: Using the capture-phase is neccessary because
  // blur/focus events don't bubble from a nested focusable
  // up to a containing focusable.
  // (i.e. from nested HTML editable up to editElm)
  editElm.addEventListener('focus', lockWrapperElm, true);
  editElm.addEventListener('blur', unlockWrapperElm, true);

  // // Do not default to contentEditable locking/scoping by default.
  // // Instead rely on focus/blur handlers above.
  // wrapperElm.contentEditable = false;

  elm.parentNode.replaceChild(wrapperElm, elm);
  var newWidget = new plugin({
    data: data,
    wrapperElm: wrapperElm,
    editElm: editElm,
  });
  widgets.push( newWidget );
};



// When the user injects one or more new/empty widgets
// into an editElm, this function gets called to initialize the
// inserted empty widget-markers.
var scanForInsertMarkers = function () {
  // HTML-Snippet (Greinaklippur) example:
  //     <img data-transpozor-insert="pluginId" onload="EPLICA.inlineEditor.transpozor.rescan()" src="https://eplica-cdn.is/f/e2-w.png" />
  //
  // JavaScript injection example:
  //     var widgetMarker = document.createElement('div');
  //     widgetMarker.setAttribute('data-transpozor-insert', 'pluginId');
  //     editElm.appendChild( widgetMarker );
  //     transpozor.rescan();
  //
  $('[data-transpozor-insert]').forEach(function (placeholderElm) {
    var type = placeholderElm.getAttribute('data-transpozor-insert');
    var plugin = pluginsById[type];
    if ( plugin ) {
      var editElm = placeholderElm.parentNode;
      var nonEditElmParent;
      while (editElm && !editElm.is('.EPLICA_editzone')) {
        nonEditElmParent = editElm;
        editElm = editElm.parentNode;
      }
      if ( editElm ) {
        var insert = plugin.validateInsertion && plugin.validateInsertion( placeholderElm, editElm );
        if ( insert === false ) {
          placeholderElm.parentNode.removeChild( placeholderElm );
        }
        else {
          if ( !plugin.validateInsertion && nonEditElmParent ) {
            editElm.insertBefore( placeholderElm, nonEditElmParent.nextSibling );
          }
          createWidget(plugin, placeholderElm, editElm, true);
        }
      }
    }
  });
};



var _registered;
var registerWithEditor = function (editor) {
  if ( !_registered ) {
    _registered = true;

    editor = editor || window.EPLICA.inlineEditor;

    // Expose transpozor as part of the Eplica inlineEditor.
    editor.transpozor = transpozor;

    var _pluginSelectors;
    var pluginSelectors = function () {
      if ( _pluginSelectors === undefined ) {
        _pluginSelectors = plugins
            .map(function (plugin) { return plugin.selector; })
            .join(', ');
      }
      return _pluginSelectors;
    };

    editor.addEvent('EditorOpen', function (e) {
      var editElms = e.editElms;
      // Something in the Editor activation process messes with
      // event-handlers and dynamic behaviours set by the plugins -
      // so we need to wait for it to finish before initing
      setTimeout(function() {
        editElms.forEach(function (editElm) {
          if ( editElm.getAttribute('entrytype') === 'html' ) {
            var transposeElms = $(pluginSelectors(), editElm);
            events.start.forEach(function (handler) {
              handler({
                editElm: editElm,
                transposeElms: transposeElms,
                // transposeSelectors: pluginSelectors(),
              });
            });
            plugins.forEach(function (plugin) {
              var consumables = $(plugin.selector, editElm);
              consumables.forEach(function (elm) {
                createWidget(plugin, elm, editElm);
              });
            });
          }
        });
        scanForInsertMarkers();
      }, 0);
    });


    editor.addEvent('SaveStart', function (e) {
      var editElm = e.target;
      if ( e.targetType === 'html' ) {
        // Signal to all widgets to re-render as static HTML
        widgets.forEach(function (widget) {
          widget.toHTML();
        });
        // Zap wrappers
        $('[data-transpozor-wrapper]', editElm).forEach(function (wrapper) {
          var parent = wrapper.parentNode;
          while ( wrapper.firstChild ) {
            parent.insertBefore(wrapper.firstChild, wrapper);
          }
          parent.removeChild(wrapper);
        });
        var transposeElms = $(pluginSelectors(), editElm);
        events.end.forEach(function (handler) {
          handler({
            editElm: editElm,
            transposeElms: transposeElms,
            // transposeSelectors: pluginSelectors(),
          });
        });
      }
    });

  }
  return transpozor;
};

var addPlugin = function (plugin) {
  registerWithEditor(); // safe to run multiple times
  plugins.push(plugin);
  pluginsById[ plugin.id ] = plugin;
  return transpozor;
};

var addEvent = function (type, handler) {
  events[type].push(handler);
  return transpozor;
};


transpozor = {
  addPlugin: addPlugin,
  on: addEvent,
  registerWithEditor: registerWithEditor,

  rescan: scanForInsertMarkers,
};


export default transpozor;
