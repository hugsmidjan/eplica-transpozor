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
      const value = attrs[name];
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




const makeWidgetToolbar = function (widget, actions) {
  const wrapperElm = widget.wrapperElm;
  const removeBtn = E('button', {
                      'data-transpozor-button': 'remove',
                      onClick: function (/*e*/) {
                        const cancelledByWidget = widget.onRemove && widget.onRemove();
                        if ( cancelledByWidget != null ? cancelledByWidget : confirm('Remove Widget!?') ) {
                          actions.remove();
                          wrapperElm.parentNode.removeChild( wrapperElm );
                          const pos = widgets.indexOf( widget );
                          widgets.splice( pos, 1);
                        }
                      },
                      title: 'Remove',
                    }, 'X');
  const moveupBtn = E('button', {
                      'data-transpozor-button': 'moveup',
                      onClick: function (/*e*/) {
                        let prevElm = wrapperElm.previousElementSibling;
                        if ( prevElm ) {
                          wrapperElm.parentNode.insertBefore(wrapperElm, prevElm);
                          moveupBtn.disabled = !wrapperElm.previousSibling;
                          movedownBtn.disabled = !wrapperElm.nextSibling;
                        }
                      },
                      _disabled: !wrapperElm.previousSibling,
                      title: 'Move Up',
                    }, '↑');
  const movedownBtn = E('button', {
                      'data-transpozor-button': 'movedown',
                      onClick: function (/*e*/) {
                        let nextElm = wrapperElm.nextElementSibling;
                        if ( nextElm ) {
                          wrapperElm.parentNode.insertBefore(wrapperElm, nextElm.nextSibling);
                          moveupBtn.disabled = !wrapperElm.previousSibling;
                          movedownBtn.disabled = !wrapperElm.nextSibling;
                        }
                      },
                      _disabled: !wrapperElm.nextSibling,
                      title: 'Move Down',
                    }, '↓');

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
            removeBtn
          );
};



const defaultParseData = function (elm) {
  return JSON.parse( elm.getAttribute('data-transpozor') ) || {};
};

const createWidget = function (plugin, elm, editElm, isInserting) {
  const data = (plugin.parseData||defaultParseData)(elm, editElm, isInserting);

  // Add class="." to sidestep Inline Editor's "Class-/ID-less <div> and <span> cleanup" phase
  const containerElm = E('div', { class:'.', 'data-transpozor-container':'' });
  const wrapperElm = E('div', { class:'.', 'data-transpozor-wrapper':'' }, containerElm);

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
  newWidget.wrapperElm = wrapperElm;

  const toolbar = makeWidgetToolbar(newWidget, {
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


    // Allow opting in to using 'SaveStart' event - to support older (<4.1.3) EPLICA versions.
    const saveEvent = transpozor.undocumented_option_useSaveStartEvent ? 'SaveStart' : 'Save';

    editor.addEvent(saveEvent, function (e) {
      const editElm = e.target;
      if ( e.targetType === 'html' ) {
        // Signal to all widgets to re-render as static HTML
        widgets.slice().forEach(function (widget, i) {
          let widgetEditElm = widget.editElm;
          if ( !widgetEditElm ) {
            widgetEditElm = widget.wrapperElm;
            while ( widgetEditElm && !widgetEditElm.is('.EPLICA_editzone') ) {
              widgetEditElm = widgetEditElm.parentNode;
            }
          }
          if ( widgetEditElm === editElm ) {
            widget.toHTML();
            widgets.splice(i,1);
          }
        });
        // Zap wrappers
        $('[data-transpozor-container]', editElm).forEach(container => {
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
