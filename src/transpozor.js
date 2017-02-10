let transpozor;
const plugins = [];
const pluginsById = {};
const widgets = [];

const events = {
  start: [],
  end: [],
};

// Element#matches normalization.
const ep = Element.prototype;
ep.is = ep.matches || ep.msMatchesSelector || ep.webkitMatchesSelector;



const E = function (tagName, attrs) {
  const elm = document.createElement(tagName);
  if (attrs) {
    for (let name in attrs) {
      elm.setAttribute(name, attrs[name]);
    }
  }
  if ( arguments.length > 2 ) {
    const children = [].slice.call(arguments, 2);
    children.forEach(child => {
      if ( typeof child === 'string' ) {
        child = document.createTextNode( child );
      }
      elm.appendChild( child );
    });
  }
  return elm;
};

const $ = function (selector, elm) {
  return !selector ? [] : [].slice.call( (elm||document).querySelectorAll(selector) );
};




const makeWidgetToolbar = function ( widget, wrapperElm, actions) {
  const removeBtn = E('button', { 'data-transpozor-button': 'remove', title: 'Remove' }, 'X');
  removeBtn.addEventListener('click', function(){
    const cancelledByWidget = widget.onRemove && widget.onRemove();
    if ( cancelledByWidget != null ? cancelledByWidget : confirm('Remove Widget!?') ) {
      actions.remove();
      wrapperElm.parentNode.removeChild( wrapperElm );
      const pos = widgets.indexOf( widget );
      widgets.splice( pos, 1);
    }
  });

  let relax;
  const highlight = function () {
    clearTimeout(relax);
    relax = setTimeout(function () {
      wrapperElm.setAttribute('data-transpozor-wrapper-active','');
    }, 100);
  }
  const deHighlight = function () {
    clearTimeout(relax);
    relax = setTimeout(function () {
      wrapperElm.removeAttribute('data-transpozor-wrapper-active');
    }, 100);
  }

  const toolbar = E('div', {
                    'data-transpozor-toolbar': '',
                    lang: 'en',
                  },
                  removeBtn
                );
  toolbar.addEventListener('focusin', highlight);
  toolbar.addEventListener('mouseenter', highlight);
  toolbar.addEventListener('focusout', deHighlight);
  toolbar.addEventListener('mouseleave', deHighlight);

  return toolbar;
};



const defaultParseData = function (elm) {
  return JSON.parse( elm.getAttribute('data-transpozor') ) || {};
};

const createWidget = function (plugin, elm, editElm, isInserting) {
  const data = (plugin.parseData||defaultParseData)(elm, editElm, isInserting);

  const containerElm = E('div', { 'data-transpozor-container':'' });
  const wrapperElm = E('div', { 'data-transpozor-wrapper':'' }, containerElm);

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
      setTimeout(()=>{ wrapperElm.contentEditable = false; }, 500);
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
  const isExternallySourced = function (e) {
    return  (
      !e.relatedTarget ||
      ( !e.relatedTarget.contains(e.target) &&
        !e.target.contains(e.relatedTarget)
      )
    );
  };
  const lockWrapperElm = function(e){
    if (wrapperElm.contedEditable !== 'false' && isExternallySourced(e) ) {
      wrapperElm.contentEditable = false;
    }
  };
  const unlockWrapperElm = function(e){
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
  const newWidget = new plugin({
    data: data,
    rootElm: containerElm,
    editElm: editElm,
    /* DEPRICATED */wrapperElm: containerElm,
  });

  const toolbar = makeWidgetToolbar(newWidget, wrapperElm, {
    remove: () => {
      editElm.removeEventListener('focus', lockWrapperElm, true);
      editElm.removeEventListener('blur', unlockWrapperElm, true);
    },
  });
  wrapperElm.appendChild( toolbar );

  widgets.push( newWidget );
};



// When the user injects one or more new/empty widgets
// into an editElm, this function gets called to initialize the
// inserted empty widget-markers.
const scanForInsertMarkers = function () {
  // HTML-Snippet (Greinaklippur) example:
  //     <img data-transpozor-insert="pluginId" onload="EPLICA.inlineEditor.transpozor.rescan()" src="https://eplica-cdn.is/f/e2-w.png" />
  //
  // JavaScript injection example:
  //     const widgetMarker = document.createElement('div');
  //     widgetMarker.setAttribute('data-transpozor-insert', 'pluginId');
  //     editElm.appendChild( widgetMarker );
  //     transpozor.rescan();
  //
  $('[data-transpozor-insert]').forEach(function (placeholderElm) {
    const type = placeholderElm.getAttribute('data-transpozor-insert');
    const plugin = pluginsById[type];
    if ( plugin ) {
      let editElm = placeholderElm.parentNode;
      let nonEditElmParent;
      while (editElm && !editElm.is('.EPLICA_editzone')) {
        nonEditElmParent = editElm;
        editElm = editElm.parentNode;
      }
      if ( editElm ) {
        const insert = plugin.validateInsertion && plugin.validateInsertion( placeholderElm, editElm );
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



let _registered;
const registerWithEditor = function (editor) {
  if ( !_registered ) {
    _registered = true;

    editor = editor || window.EPLICA.inlineEditor;

    // Expose transpozor as part of the Eplica inlineEditor.
    editor.transpozor = transpozor;

    let _pluginSelectors;
    const pluginSelectors = function () {
      if ( _pluginSelectors === undefined ) {
        _pluginSelectors = plugins
            .map(function (plugin) { return plugin.selector; })
            .join(', ');
      }
      return _pluginSelectors;
    };

    editor.addEvent('EditorOpen', function (e) {
      const editElms = e.editElms;
      // Something in the Editor activation process messes with
      // event-handlers and dynamic behaviours set by the plugins -
      // so we need to wait for it to finish before initing
      setTimeout(function() {
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
                createWidget(plugin, elm, editElm);
              });
            });
          }
        });
        scanForInsertMarkers();
      }, 0);
    });


    editor.addEvent('SaveStart', function (e) {
      const editElm = e.target;
      if ( e.targetType === 'html' ) {
        // Signal to all widgets to re-render as static HTML
        widgets.forEach(function (widget) {
          widget.toHTML();
        });
        // Zap wrappers
        $('[data-transpozor-content]', editElm).forEach(container => {
          const wrapper = container.parentNode;
          const parent = wrapper.parentNode;
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
      }
    });

  }
  return transpozor;
};

const addPlugin = function (plugin) {
  registerWithEditor(); // safe to run multiple times
  plugins.push(plugin);
  pluginsById[ plugin.id ] = plugin;
  return transpozor;
};

const addEvent = function (type, handler) {
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
