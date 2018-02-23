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
ep.is = ep.matches || ep.msMatchesSelector || ep.webkitMatchesSelector;



var E = function (tagName, attrs) {
  var children = [], len = arguments.length - 2;
  while ( len-- > 0 ) children[ len ] = arguments[ len + 2 ];

  var elm = document.createElement(tagName);
  if (attrs) {
    for (var name in attrs) {
      var value = attrs[name];
      if ( value != null ) {
        if ( (/^on[A-Z]/).test(name) ) {
          elm.addEventListener(name.substr(2).toLowerCase(), value);
        }
        else if ( name.charAt(0) === '_' ) {
          elm[name.substr(1)] = value;
        }
        else {
          elm.setAttribute(name, value);
        }
      }
    }
  }
  children.forEach(function (child) {
    if ( typeof child === 'string' ) {
      child = document.createTextNode( child );
    }
    elm.appendChild( child );
  });
  return elm;
};

var $ = function (selector, elm) { return !selector ? [] : [].slice.call( (elm||document).querySelectorAll(selector) ); };




var makeWidgetToolbar = function (widget, actions) {
  var wrapperElm = widget.wrapperElm;
  var removeBtn = E('button', {
                      'data-transpozor-button': 'remove',
                      onClick: function (/*e*/) {
                        var cancelledByWidget = widget.onRemove && widget.onRemove();
                        if ( cancelledByWidget != null ? cancelledByWidget : confirm('Remove Widget!?') ) {
                          actions.remove();
                          wrapperElm.parentNode.removeChild( wrapperElm );
                          var pos = widgets.indexOf( widget );
                          widgets.splice( pos, 1);
                        }
                      },
                      title: 'Remove',
                    }, 'X');
  var addSpace = E('button', {
                      'data-transpozor-button': 'addspace',
                      onClick: function (/*e*/) {
                        wrapperElm.insertAdjacentText('afterend', 'a');
                      },
                      title: 'Add text after',
                    }, '⎀');
  var moveupBtn = E('button', {
                      'data-transpozor-button': 'moveup',
                      onClick: function (/*e*/) {
                        var prevElm = wrapperElm.previousElementSibling;
                        if ( prevElm ) {
                          wrapperElm.parentNode.insertBefore(wrapperElm, prevElm);
                          moveupBtn.disabled = !wrapperElm.previousSibling;
                          movedownBtn.disabled = !wrapperElm.nextSibling;
                        }
                      },
                      _disabled: !wrapperElm.previousSibling,
                      title: 'Move Up',
                    }, '↑');
  var movedownBtn = E('button', {
                      'data-transpozor-button': 'movedown',
                      onClick: function (/*e*/) {
                        var nextElm = wrapperElm.nextElementSibling;
                        if ( nextElm ) {
                          wrapperElm.parentNode.insertBefore(wrapperElm, nextElm.nextSibling);
                          moveupBtn.disabled = !wrapperElm.previousSibling;
                          movedownBtn.disabled = !wrapperElm.nextSibling;
                        }
                      },
                      _disabled: !wrapperElm.nextSibling,
                      title: 'Move Down',
                    }, '↓');

  var relax;
  var highlight = function () {
    clearTimeout(relax);
    relax = setTimeout(function () {
      wrapperElm.setAttribute('data-transpozor-wrapper-active','');
    }, 100);
  };
  var deHighlight = function () {
    clearTimeout(relax);
    relax = setTimeout(function () {
      wrapperElm.removeAttribute('data-transpozor-wrapper-active');
    }, 100);
  };

  return  E('div', {
              'data-transpozor-toolbar': '',
              lang: 'en',
              onFocusin: highlight,
              onMouseenter: highlight,
              onFocusout: deHighlight,
              onMouseleave: deHighlight,
            },
            moveupBtn,
            movedownBtn,
            addSpace,
            removeBtn
          );
};



var defaultParseData = function (elm) { return JSON.parse( elm.getAttribute('data-transpozor') ) || {}; };


var createWidget = function (plugin, elm, editElm, isInserting) {
  var data = (plugin.parseData||defaultParseData)(elm, editElm, isInserting);

  // Add class="." to sidestep Inline Editor's "Class-/ID-less <div> and <span> cleanup" phase
  var containerElm = E('div', { class:'.', 'data-transpozor-container':'' });
  var wrapperElm = E('div', { class:'.', 'data-transpozor-wrapper':'' }, containerElm);

  wrapperElm.addEventListener('paste', function (e) {
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
      setTimeout(function (){ wrapperElm.contentEditable = false; }, 500);
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
  var lockWrapperElm = function (e) {
    if (wrapperElm.contedEditable !== 'false' && isExternallySourced(e) ) {
      wrapperElm.contentEditable = false;
    }
  };
  var unlockWrapperElm = function (e) {
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
    rootElm: containerElm,
    editElm: editElm,
    /* DEPRICATED */wrapperElm: containerElm,
  });
  newWidget.wrapperElm = wrapperElm;

  var toolbar = makeWidgetToolbar(newWidget, {
    remove: function () {
      editElm.removeEventListener('focus', lockWrapperElm, true);
      editElm.removeEventListener('blur', unlockWrapperElm, true);
    },
  });
  wrapperElm.appendChild( toolbar );

  widgets.push( newWidget );

  return newWidget;
};



// When the user injects one or more new/empty widgets
// into an editElm, this function gets called to initialize the
// inserted empty widget-markers.
var debouncedScan;
var scanForInsertMarkers = function (opts) {
  // HTML-Snippet (Greinaklippur) example:
  //     <img data-transpozor-insert="pluginId" onload="EPLICA.inlineEditor.transpozor.rescan()" src="https://eplica-cdn.is/f/e2-w.png" />
  //
  // JavaScript injection example:
  //     const widgetMarker = document.createElement('div');
  //     widgetMarker.setAttribute('data-transpozor-insert', 'pluginId');
  //     editElm.appendChild( widgetMarker );
  //     transpozor.rescan();
  //
  opts = opts || {};
  var delay = 'delay' in opts ? opts.delay : 10;
  clearTimeout( debouncedScan );
  debouncedScan = setTimeout(function () {
    $('[data-transpozor-insert]').forEach(function (placeholderElm) {
      var type = placeholderElm.getAttribute('data-transpozor-insert');
      var plugin = pluginsById[type];
      if ( plugin ) {
        var editElm = placeholderElm.parentNode;
        var nonEditElmParent;
        while (editElm && !editElm.is('.EPLICA_editzone')) {
          // Ignore empty, auto-inserted <div/> containers
          if ( editElm.nodeName !== 'DIV' || editElm.className ) {
            nonEditElmParent = editElm;
          }
          editElm = editElm.parentNode;
        }
        if ( editElm ) {
          var insert = plugin.validateInsertion && plugin.validateInsertion( placeholderElm, editElm );
          if ( insert === false ) {
            placeholderElm.parentNode.removeChild( placeholderElm );
          }
          else {
            if ( nonEditElmParent && !plugin.validateInsertion ) {
              nonEditElmParent.parentNode.insertBefore( placeholderElm, nonEditElmParent.nextSibling );
            }
            createWidget(plugin, placeholderElm, editElm, true);
          }
        }
      }
    });
  }, delay);
};



var _registered;
var eplicaWidgets = window.EPLICA.externalWidgetPairs || [];
var registerWithEditor = function (editor) {
  if ( !_registered ) {
    _registered = true;

    editor = editor || window.EPLICA.inlineEditor;


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
      setTimeout(function () {
        editElms.forEach(function (editElm) {
          if ( editElm.getAttribute('entrytype') === 'html' ) {
            events.start.forEach(function (handler) {
              handler({
                editElm: editElm,
                transposeElms: $(pluginSelectors(), editElm),
                // transposeSelectors: pluginSelectors(),
              });
            });
            plugins.forEach(function (plugin) {
              $(plugin.selector, editElm).forEach(function (elm) {
                var widget = createWidget(plugin, elm, editElm);
                eplicaWidgets.push([elm,widget]);
              });
            });
          }
        });
        scanForInsertMarkers();
      }, 0);
    });


    // Allow opting in to using 'SaveStart' event - to support older (<4.1.3) EPLICA versions.
    var saveEvent = transpozor.undocumented_option_useSaveStartEvent ? 'SaveStart' : 'Save';

    editor.addEvent(saveEvent, function (e) {
      var editElm = e.target;
      if ( e.targetType === 'html' ) {
        // Signal to all widgets to re-render as static HTML
        var widgetToHtmlReturns = [];
        widgets.slice().forEach(function (widget, i) {
        // const widgetToHtmlReturns = widgets.slice().map((widget, i) => {
          var widgetEditElm = widget.editElm;
          if ( !widgetEditElm ) {
            widgetEditElm = widget.wrapperElm;
            while ( widgetEditElm && !widgetEditElm.is('.EPLICA_editzone') ) {
              widgetEditElm = widgetEditElm.parentNode;
            }
          }
          if ( widgetEditElm === editElm ) {
            widgets.splice(i,1);
            // return widget.toHTML();
            var ret = widget.toHTML();
            if ( ret && ret.then ) {
              widgetToHtmlReturns.push(ret);
            }
          }
        });
        var zapWrappersAndEmitEnd = function () {
          // Zap wrappers
          $('[data-transpozor-container]', editElm).forEach(function (container) {
            var wrapper = container.parentNode;
            var parent = wrapper.parentNode;
            while ( container.firstChild ) {
              parent.insertBefore(container.firstChild, wrapper);
            }
            parent.removeChild(wrapper);
          });
          events.end.forEach(function (handler) {
            handler({
              editElm: editElm,
              transposeElms: $(pluginSelectors(), editElm),
              // transposeSelectors: pluginSelectors(),
            });
          });
          return; // explicitly return undefined.
        };
        // Maintain backwards compatibility with Eplica versions (<4.1.4)
        // by only return a promise if the widgets return promises
        if ( widgetToHtmlReturns.length ) {
          return Promise.all( widgetToHtmlReturns )
              .then( zapWrappersAndEmitEnd );
        }
        // FIXME: Always return a promise when all eplica-transpozor using websites
        // have been updated to a newer (promise-supporting editor) version of Eplica.
        zapWrappersAndEmitEnd();
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


var transpozor$1 = transpozor;

export default transpozor$1;
//# sourceMappingURL=transpozor.js.map
