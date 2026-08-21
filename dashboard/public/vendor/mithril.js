var __commonJS = (cb, mod) => () => (mod || cb((mod = { exports: {} }).exports, mod), mod.exports);

// node_modules/mithril/mithril.js
var require_mithril = __commonJS((exports, module) => {
  (function() {
    function Vnode(tag, key, attrs0, children, text, dom) {
      return { tag, key, attrs: attrs0, children, text, dom, is: undefined, domSize: undefined, state: undefined, events: undefined, instance: undefined };
    }
    Vnode.normalize = function(node) {
      if (Array.isArray(node))
        return Vnode("[", undefined, undefined, Vnode.normalizeChildren(node), undefined, undefined);
      if (node == null || typeof node === "boolean")
        return null;
      if (typeof node === "object")
        return node;
      return Vnode("#", undefined, undefined, String(node), undefined, undefined);
    };
    Vnode.normalizeChildren = function(input) {
      var children = new Array(input.length);
      var numKeyed = 0;
      for (var i = 0;i < input.length; i++) {
        children[i] = Vnode.normalize(input[i]);
        if (children[i] !== null && children[i].key != null)
          numKeyed++;
      }
      if (numKeyed !== 0 && numKeyed !== input.length) {
        throw new TypeError(children.includes(null) ? "In fragments, vnodes must either all have keys or none have keys. You may wish to consider using an explicit keyed empty fragment, m.fragment({key: ...}), instead of a hole." : "In fragments, vnodes must either all have keys or none have keys.");
      }
      return children;
    };
    var hyperscriptVnode = function(attrs1, children0) {
      if (attrs1 == null || typeof attrs1 === "object" && attrs1.tag == null && !Array.isArray(attrs1)) {
        if (children0.length === 1 && Array.isArray(children0[0]))
          children0 = children0[0];
      } else {
        children0 = children0.length === 0 && Array.isArray(attrs1) ? attrs1 : [attrs1, ...children0];
        attrs1 = undefined;
      }
      return Vnode("", attrs1 && attrs1.key, attrs1, children0);
    };
    var hasOwn = {}.hasOwnProperty;
    var emptyAttrs = {};
    var cachedAttrsIsStaticMap = new Map([[emptyAttrs, true]]);
    var selectorParser = /(?:(^|#|\.)([^#\.\[\]]+))|(\[(.+?)(?:\s*=\s*("|'|)((?:\\["'\]]|.)*?)\5)?\])/g;
    var selectorCache = Object.create(null);
    function isEmpty(object) {
      for (var key in object)
        if (hasOwn.call(object, key))
          return false;
      return true;
    }
    function isFormAttributeKey(key) {
      return key === "value" || key === "checked" || key === "selectedIndex" || key === "selected";
    }
    function compileSelector(selector) {
      var match, tag = "div", classes = [], attrs = {}, isStatic = true;
      while (match = selectorParser.exec(selector)) {
        var type = match[1], value = match[2];
        if (type === "" && value !== "")
          tag = value;
        else if (type === "#")
          attrs.id = value;
        else if (type === ".")
          classes.push(value);
        else if (match[3][0] === "[") {
          var attrValue = match[6];
          if (attrValue)
            attrValue = attrValue.replace(/\\(["'])/g, "$1").replace(/\\\\/g, "\\");
          if (match[4] === "class")
            classes.push(attrValue);
          else {
            attrs[match[4]] = attrValue === "" ? attrValue : attrValue || true;
            if (isFormAttributeKey(match[4]))
              isStatic = false;
          }
        }
      }
      if (classes.length > 0)
        attrs.className = classes.join(" ");
      if (isEmpty(attrs))
        attrs = emptyAttrs;
      else
        cachedAttrsIsStaticMap.set(attrs, isStatic);
      return selectorCache[selector] = { tag, attrs, is: attrs.is };
    }
    function execSelector(state, vnode) {
      vnode.tag = state.tag;
      var attrs = vnode.attrs;
      if (attrs == null) {
        vnode.attrs = state.attrs;
        vnode.is = state.is;
        return vnode;
      }
      if (hasOwn.call(attrs, "class")) {
        if (attrs.class != null)
          attrs.className = attrs.class;
        attrs.class = null;
      }
      if (state.attrs !== emptyAttrs) {
        var className = attrs.className;
        attrs = Object.assign({}, state.attrs, attrs);
        if (state.attrs.className != null)
          attrs.className = className != null ? String(state.attrs.className) + " " + String(className) : state.attrs.className;
      }
      if (state.tag === "input" && hasOwn.call(attrs, "type")) {
        attrs = Object.assign({ type: attrs.type }, attrs);
      }
      vnode.is = attrs.is;
      vnode.attrs = attrs;
      return vnode;
    }
    function hyperscript(selector, attrs, ...children) {
      if (selector == null || typeof selector !== "string" && typeof selector !== "function" && typeof selector.view !== "function") {
        throw Error("The selector must be either a string or a component.");
      }
      var vnode = hyperscriptVnode(attrs, children);
      if (typeof selector === "string") {
        vnode.children = Vnode.normalizeChildren(vnode.children);
        if (selector !== "[")
          return execSelector(selectorCache[selector] || compileSelector(selector), vnode);
      }
      if (vnode.attrs == null)
        vnode.attrs = {};
      vnode.tag = selector;
      return vnode;
    }
    hyperscript.trust = function(html) {
      if (html == null)
        html = "";
      return Vnode("<", undefined, undefined, html, undefined, undefined);
    };
    hyperscript.fragment = function(attrs4, ...children1) {
      var vnode2 = hyperscriptVnode(attrs4, children1);
      if (vnode2.attrs == null)
        vnode2.attrs = {};
      vnode2.tag = "[";
      vnode2.children = Vnode.normalizeChildren(vnode2.children);
      return vnode2;
    };
    var delayedRemoval = new WeakMap;
    function* domFor(vnode4) {
      var dom = vnode4.dom;
      var domSize0 = vnode4.domSize;
      var generation0 = delayedRemoval.get(dom);
      if (dom != null)
        do {
          var nextSibling = dom.nextSibling;
          if (delayedRemoval.get(dom) === generation0) {
            yield dom;
            domSize0--;
          }
          dom = nextSibling;
        } while (domSize0);
    }
    var _14 = function() {
      var nameSpace = {
        svg: "http://www.w3.org/2000/svg",
        math: "http://www.w3.org/1998/Math/MathML"
      };
      var currentRedraw;
      var currentRender;
      function getDocument(dom) {
        return dom.ownerDocument;
      }
      function getNameSpace(vnode3) {
        return vnode3.attrs && vnode3.attrs.xmlns || nameSpace[vnode3.tag];
      }
      function checkState(vnode3, original) {
        if (vnode3.state !== original)
          throw new Error("'vnode.state' must not be modified.");
      }
      function callHook(vnode3) {
        var original = vnode3.state;
        try {
          return this.apply(original, arguments);
        } finally {
          checkState(vnode3, original);
        }
      }
      function activeElement(dom) {
        try {
          return getDocument(dom).activeElement;
        } catch (e) {
          return null;
        }
      }
      function createNodes(parent, vnodes, start, end, hooks, nextSibling, ns) {
        for (var i = start;i < end; i++) {
          var vnode3 = vnodes[i];
          if (vnode3 != null) {
            createNode(parent, vnode3, hooks, ns, nextSibling);
          }
        }
      }
      function createNode(parent, vnode3, hooks, ns, nextSibling) {
        var tag = vnode3.tag;
        if (typeof tag === "string") {
          vnode3.state = {};
          if (vnode3.attrs != null)
            initLifecycle(vnode3.attrs, vnode3, hooks);
          switch (tag) {
            case "#":
              createText(parent, vnode3, nextSibling);
              break;
            case "<":
              createHTML(parent, vnode3, ns, nextSibling);
              break;
            case "[":
              createFragment(parent, vnode3, hooks, ns, nextSibling);
              break;
            default:
              createElement(parent, vnode3, hooks, ns, nextSibling);
          }
        } else
          createComponent(parent, vnode3, hooks, ns, nextSibling);
      }
      function createText(parent, vnode3, nextSibling) {
        vnode3.dom = getDocument(parent).createTextNode(vnode3.children);
        insertDOM(parent, vnode3.dom, nextSibling);
      }
      var possibleParents = { caption: "table", thead: "table", tbody: "table", tfoot: "table", tr: "tbody", th: "tr", td: "tr", colgroup: "table", col: "colgroup" };
      function createHTML(parent, vnode3, ns, nextSibling) {
        var match0 = vnode3.children.match(/^\s*?<(\w+)/im) || [];
        var temp = getDocument(parent).createElement(possibleParents[match0[1]] || "div");
        if (ns === "http://www.w3.org/2000/svg") {
          temp.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg">' + vnode3.children + "</svg>";
          temp = temp.firstChild;
        } else {
          temp.innerHTML = vnode3.children;
        }
        vnode3.dom = temp.firstChild;
        vnode3.domSize = temp.childNodes.length;
        var fragment = getDocument(parent).createDocumentFragment();
        var child;
        while (child = temp.firstChild) {
          fragment.appendChild(child);
        }
        insertDOM(parent, fragment, nextSibling);
      }
      function createFragment(parent, vnode3, hooks, ns, nextSibling) {
        var fragment = getDocument(parent).createDocumentFragment();
        if (vnode3.children != null) {
          var children2 = vnode3.children;
          createNodes(fragment, children2, 0, children2.length, hooks, null, ns);
        }
        vnode3.dom = fragment.firstChild;
        vnode3.domSize = fragment.childNodes.length;
        insertDOM(parent, fragment, nextSibling);
      }
      function createElement(parent, vnode3, hooks, ns, nextSibling) {
        var tag = vnode3.tag;
        var attrs5 = vnode3.attrs;
        var is = vnode3.is;
        ns = getNameSpace(vnode3) || ns;
        var element = ns ? is ? getDocument(parent).createElementNS(ns, tag, { is }) : getDocument(parent).createElementNS(ns, tag) : is ? getDocument(parent).createElement(tag, { is }) : getDocument(parent).createElement(tag);
        vnode3.dom = element;
        if (attrs5 != null) {
          setAttrs(vnode3, attrs5, ns);
        }
        insertDOM(parent, element, nextSibling);
        if (!maybeSetContentEditable(vnode3)) {
          if (vnode3.children != null) {
            var children2 = vnode3.children;
            createNodes(element, children2, 0, children2.length, hooks, null, ns);
            if (vnode3.tag === "select" && attrs5 != null)
              setLateSelectAttrs(vnode3, attrs5);
          }
        }
      }
      function initComponent(vnode3, hooks) {
        var sentinel;
        if (typeof vnode3.tag.view === "function") {
          vnode3.state = Object.create(vnode3.tag);
          sentinel = vnode3.state.view;
          if (sentinel.$$reentrantLock$$ != null)
            return;
          sentinel.$$reentrantLock$$ = true;
        } else {
          vnode3.state = undefined;
          sentinel = vnode3.tag;
          if (sentinel.$$reentrantLock$$ != null)
            return;
          sentinel.$$reentrantLock$$ = true;
          vnode3.state = vnode3.tag.prototype != null && typeof vnode3.tag.prototype.view === "function" ? new vnode3.tag(vnode3) : vnode3.tag(vnode3);
        }
        initLifecycle(vnode3.state, vnode3, hooks);
        if (vnode3.attrs != null)
          initLifecycle(vnode3.attrs, vnode3, hooks);
        vnode3.instance = Vnode.normalize(callHook.call(vnode3.state.view, vnode3));
        if (vnode3.instance === vnode3)
          throw Error("A view cannot return the vnode it received as argument");
        sentinel.$$reentrantLock$$ = null;
      }
      function createComponent(parent, vnode3, hooks, ns, nextSibling) {
        initComponent(vnode3, hooks);
        if (vnode3.instance != null) {
          createNode(parent, vnode3.instance, hooks, ns, nextSibling);
          vnode3.dom = vnode3.instance.dom;
          vnode3.domSize = vnode3.instance.domSize;
        } else {
          vnode3.domSize = 0;
        }
      }
      function updateNodes(parent, old, vnodes, hooks, nextSibling, ns) {
        if (old === vnodes || old == null && vnodes == null)
          return;
        else if (old == null || old.length === 0)
          createNodes(parent, vnodes, 0, vnodes.length, hooks, nextSibling, ns);
        else if (vnodes == null || vnodes.length === 0)
          removeNodes(parent, old, 0, old.length);
        else {
          var isOldKeyed = old[0] != null && old[0].key != null;
          var isKeyed = vnodes[0] != null && vnodes[0].key != null;
          var start = 0, oldStart = 0;
          if (!isOldKeyed)
            while (oldStart < old.length && old[oldStart] == null)
              oldStart++;
          if (!isKeyed)
            while (start < vnodes.length && vnodes[start] == null)
              start++;
          if (isOldKeyed !== isKeyed) {
            removeNodes(parent, old, oldStart, old.length);
            createNodes(parent, vnodes, start, vnodes.length, hooks, nextSibling, ns);
          } else if (!isKeyed) {
            var commonLength = old.length < vnodes.length ? old.length : vnodes.length;
            start = start < oldStart ? start : oldStart;
            for (;start < commonLength; start++) {
              o = old[start];
              v = vnodes[start];
              if (o === v || o == null && v == null)
                continue;
              else if (o == null)
                createNode(parent, v, hooks, ns, getNextSibling(old, start + 1, nextSibling));
              else if (v == null)
                removeNode(parent, o);
              else
                updateNode(parent, o, v, hooks, getNextSibling(old, start + 1, nextSibling), ns);
            }
            if (old.length > commonLength)
              removeNodes(parent, old, start, old.length);
            if (vnodes.length > commonLength)
              createNodes(parent, vnodes, start, vnodes.length, hooks, nextSibling, ns);
          } else {
            var oldEnd = old.length - 1, end = vnodes.length - 1, map, o, v, oe, ve, topSibling;
            while (oldEnd >= oldStart && end >= start) {
              oe = old[oldEnd];
              ve = vnodes[end];
              if (oe.key !== ve.key)
                break;
              if (oe !== ve)
                updateNode(parent, oe, ve, hooks, nextSibling, ns);
              if (ve.dom != null)
                nextSibling = ve.dom;
              oldEnd--, end--;
            }
            while (oldEnd >= oldStart && end >= start) {
              o = old[oldStart];
              v = vnodes[start];
              if (o.key !== v.key)
                break;
              oldStart++, start++;
              if (o !== v)
                updateNode(parent, o, v, hooks, getNextSibling(old, oldStart, nextSibling), ns);
            }
            while (oldEnd >= oldStart && end >= start) {
              if (start === end)
                break;
              if (o.key !== ve.key || oe.key !== v.key)
                break;
              topSibling = getNextSibling(old, oldStart, nextSibling);
              moveDOM(parent, oe, topSibling);
              if (oe !== v)
                updateNode(parent, oe, v, hooks, topSibling, ns);
              if (++start <= --end)
                moveDOM(parent, o, nextSibling);
              if (o !== ve)
                updateNode(parent, o, ve, hooks, nextSibling, ns);
              if (ve.dom != null)
                nextSibling = ve.dom;
              oldStart++;
              oldEnd--;
              oe = old[oldEnd];
              ve = vnodes[end];
              o = old[oldStart];
              v = vnodes[start];
            }
            while (oldEnd >= oldStart && end >= start) {
              if (oe.key !== ve.key)
                break;
              if (oe !== ve)
                updateNode(parent, oe, ve, hooks, nextSibling, ns);
              if (ve.dom != null)
                nextSibling = ve.dom;
              oldEnd--, end--;
              oe = old[oldEnd];
              ve = vnodes[end];
            }
            if (start > end)
              removeNodes(parent, old, oldStart, oldEnd + 1);
            else if (oldStart > oldEnd)
              createNodes(parent, vnodes, start, end + 1, hooks, nextSibling, ns);
            else {
              var originalNextSibling = nextSibling, vnodesLength = end - start + 1, oldIndices = new Array(vnodesLength), li = 0, i = 0, pos = 2147483647, matched = 0, map, lisIndices;
              for (i = 0;i < vnodesLength; i++)
                oldIndices[i] = -1;
              for (i = end;i >= start; i--) {
                if (map == null)
                  map = getKeyMap(old, oldStart, oldEnd + 1);
                ve = vnodes[i];
                var oldIndex = map[ve.key];
                if (oldIndex != null) {
                  pos = oldIndex < pos ? oldIndex : -1;
                  oldIndices[i - start] = oldIndex;
                  oe = old[oldIndex];
                  old[oldIndex] = null;
                  if (oe !== ve)
                    updateNode(parent, oe, ve, hooks, nextSibling, ns);
                  if (ve.dom != null)
                    nextSibling = ve.dom;
                  matched++;
                }
              }
              nextSibling = originalNextSibling;
              if (matched !== oldEnd - oldStart + 1)
                removeNodes(parent, old, oldStart, oldEnd + 1);
              if (matched === 0)
                createNodes(parent, vnodes, start, end + 1, hooks, nextSibling, ns);
              else {
                if (pos === -1) {
                  lisIndices = makeLisIndices(oldIndices);
                  li = lisIndices.length - 1;
                  for (i = end;i >= start; i--) {
                    v = vnodes[i];
                    if (oldIndices[i - start] === -1)
                      createNode(parent, v, hooks, ns, nextSibling);
                    else {
                      if (lisIndices[li] === i - start)
                        li--;
                      else
                        moveDOM(parent, v, nextSibling);
                    }
                    if (v.dom != null)
                      nextSibling = vnodes[i].dom;
                  }
                } else {
                  for (i = end;i >= start; i--) {
                    v = vnodes[i];
                    if (oldIndices[i - start] === -1)
                      createNode(parent, v, hooks, ns, nextSibling);
                    if (v.dom != null)
                      nextSibling = vnodes[i].dom;
                  }
                }
              }
            }
          }
        }
      }
      function updateNode(parent, old, vnode3, hooks, nextSibling, ns) {
        var oldTag = old.tag, tag = vnode3.tag;
        if (oldTag === tag && old.is === vnode3.is) {
          vnode3.state = old.state;
          vnode3.events = old.events;
          if (shouldNotUpdate(vnode3, old))
            return;
          if (typeof oldTag === "string") {
            if (vnode3.attrs != null) {
              updateLifecycle(vnode3.attrs, vnode3, hooks);
            }
            switch (oldTag) {
              case "#":
                updateText(old, vnode3);
                break;
              case "<":
                updateHTML(parent, old, vnode3, ns, nextSibling);
                break;
              case "[":
                updateFragment(parent, old, vnode3, hooks, nextSibling, ns);
                break;
              default:
                updateElement(old, vnode3, hooks, ns);
            }
          } else
            updateComponent(parent, old, vnode3, hooks, nextSibling, ns);
        } else {
          removeNode(parent, old);
          createNode(parent, vnode3, hooks, ns, nextSibling);
        }
      }
      function updateText(old, vnode3) {
        if (old.children.toString() !== vnode3.children.toString()) {
          old.dom.nodeValue = vnode3.children;
        }
        vnode3.dom = old.dom;
      }
      function updateHTML(parent, old, vnode3, ns, nextSibling) {
        if (old.children !== vnode3.children) {
          removeDOM(parent, old);
          createHTML(parent, vnode3, ns, nextSibling);
        } else {
          vnode3.dom = old.dom;
          vnode3.domSize = old.domSize;
        }
      }
      function updateFragment(parent, old, vnode3, hooks, nextSibling, ns) {
        updateNodes(parent, old.children, vnode3.children, hooks, nextSibling, ns);
        var domSize = 0, children2 = vnode3.children;
        vnode3.dom = null;
        if (children2 != null) {
          for (var i = 0;i < children2.length; i++) {
            var child = children2[i];
            if (child != null && child.dom != null) {
              if (vnode3.dom == null)
                vnode3.dom = child.dom;
              domSize += child.domSize || 1;
            }
          }
        }
        vnode3.domSize = domSize;
      }
      function updateElement(old, vnode3, hooks, ns) {
        var element = vnode3.dom = old.dom;
        ns = getNameSpace(vnode3) || ns;
        if (old.attrs != vnode3.attrs || vnode3.attrs != null && !cachedAttrsIsStaticMap.get(vnode3.attrs)) {
          updateAttrs(vnode3, old.attrs, vnode3.attrs, ns);
        }
        if (!maybeSetContentEditable(vnode3)) {
          updateNodes(element, old.children, vnode3.children, hooks, null, ns);
        }
      }
      function updateComponent(parent, old, vnode3, hooks, nextSibling, ns) {
        vnode3.instance = Vnode.normalize(callHook.call(vnode3.state.view, vnode3));
        if (vnode3.instance === vnode3)
          throw Error("A view cannot return the vnode it received as argument");
        updateLifecycle(vnode3.state, vnode3, hooks);
        if (vnode3.attrs != null)
          updateLifecycle(vnode3.attrs, vnode3, hooks);
        if (vnode3.instance != null) {
          if (old.instance == null)
            createNode(parent, vnode3.instance, hooks, ns, nextSibling);
          else
            updateNode(parent, old.instance, vnode3.instance, hooks, nextSibling, ns);
          vnode3.dom = vnode3.instance.dom;
          vnode3.domSize = vnode3.instance.domSize;
        } else {
          if (old.instance != null)
            removeNode(parent, old.instance);
          vnode3.domSize = 0;
        }
      }
      function getKeyMap(vnodes, start, end) {
        var map = Object.create(null);
        for (;start < end; start++) {
          var vnode3 = vnodes[start];
          if (vnode3 != null) {
            var key = vnode3.key;
            if (key != null)
              map[key] = start;
          }
        }
        return map;
      }
      var lisTemp = [];
      function makeLisIndices(a) {
        var result = [0];
        var u = 0, v = 0, i = 0;
        var il = lisTemp.length = a.length;
        for (var i = 0;i < il; i++)
          lisTemp[i] = a[i];
        for (var i = 0;i < il; ++i) {
          if (a[i] === -1)
            continue;
          var j = result[result.length - 1];
          if (a[j] < a[i]) {
            lisTemp[i] = j;
            result.push(i);
            continue;
          }
          u = 0;
          v = result.length - 1;
          while (u < v) {
            var c = (u >>> 1) + (v >>> 1) + (u & v & 1);
            if (a[result[c]] < a[i]) {
              u = c + 1;
            } else {
              v = c;
            }
          }
          if (a[i] < a[result[u]]) {
            if (u > 0)
              lisTemp[i] = result[u - 1];
            result[u] = i;
          }
        }
        u = result.length;
        v = result[u - 1];
        while (u-- > 0) {
          result[u] = v;
          v = lisTemp[v];
        }
        lisTemp.length = 0;
        return result;
      }
      function getNextSibling(vnodes, i, nextSibling) {
        for (;i < vnodes.length; i++) {
          if (vnodes[i] != null && vnodes[i].dom != null)
            return vnodes[i].dom;
        }
        return nextSibling;
      }
      function moveDOM(parent, vnode3, nextSibling) {
        if (vnode3.dom != null) {
          var target;
          if (vnode3.domSize == null || vnode3.domSize === 1) {
            target = vnode3.dom;
          } else {
            target = getDocument(parent).createDocumentFragment();
            for (var dom of domFor(vnode3))
              target.appendChild(dom);
          }
          insertDOM(parent, target, nextSibling);
        }
      }
      function insertDOM(parent, dom, nextSibling) {
        if (nextSibling != null)
          parent.insertBefore(dom, nextSibling);
        else
          parent.appendChild(dom);
      }
      function maybeSetContentEditable(vnode3) {
        if (vnode3.attrs == null || vnode3.attrs.contenteditable == null && vnode3.attrs.contentEditable == null)
          return false;
        var children2 = vnode3.children;
        if (children2 != null && children2.length === 1 && children2[0].tag === "<") {
          var content = children2[0].children;
          if (vnode3.dom.innerHTML !== content)
            vnode3.dom.innerHTML = content;
        } else if (children2 != null && children2.length !== 0)
          throw new Error("Child node of a contenteditable must be trusted.");
        return true;
      }
      function removeNodes(parent, vnodes, start, end) {
        for (var i = start;i < end; i++) {
          var vnode3 = vnodes[i];
          if (vnode3 != null)
            removeNode(parent, vnode3);
        }
      }
      function tryBlockRemove(parent, vnode3, source, counter) {
        var original = vnode3.state;
        var result = callHook.call(source.onbeforeremove, vnode3);
        if (result == null)
          return;
        var generation = currentRender;
        for (var dom of domFor(vnode3))
          delayedRemoval.set(dom, generation);
        counter.v++;
        Promise.resolve(result).finally(function() {
          checkState(vnode3, original);
          tryResumeRemove(parent, vnode3, counter);
        });
      }
      function tryResumeRemove(parent, vnode3, counter) {
        if (--counter.v === 0) {
          onremove(vnode3);
          removeDOM(parent, vnode3);
        }
      }
      function removeNode(parent, vnode3) {
        var counter = { v: 1 };
        if (typeof vnode3.tag !== "string" && typeof vnode3.state.onbeforeremove === "function")
          tryBlockRemove(parent, vnode3, vnode3.state, counter);
        if (vnode3.attrs && typeof vnode3.attrs.onbeforeremove === "function")
          tryBlockRemove(parent, vnode3, vnode3.attrs, counter);
        tryResumeRemove(parent, vnode3, counter);
      }
      function removeDOM(parent, vnode3) {
        if (vnode3.dom == null)
          return;
        if (vnode3.domSize == null || vnode3.domSize === 1) {
          parent.removeChild(vnode3.dom);
        } else {
          for (var dom of domFor(vnode3))
            parent.removeChild(dom);
        }
      }
      function onremove(vnode3) {
        if (typeof vnode3.tag !== "string" && typeof vnode3.state.onremove === "function")
          callHook.call(vnode3.state.onremove, vnode3);
        if (vnode3.attrs && typeof vnode3.attrs.onremove === "function")
          callHook.call(vnode3.attrs.onremove, vnode3);
        if (typeof vnode3.tag !== "string") {
          if (vnode3.instance != null)
            onremove(vnode3.instance);
        } else {
          if (vnode3.events != null)
            vnode3.events._ = null;
          var children2 = vnode3.children;
          if (Array.isArray(children2)) {
            for (var i = 0;i < children2.length; i++) {
              var child = children2[i];
              if (child != null)
                onremove(child);
            }
          }
        }
      }
      function setAttrs(vnode3, attrs5, ns) {
        for (var key in attrs5) {
          setAttr(vnode3, key, null, attrs5[key], ns);
        }
      }
      function setAttr(vnode3, key, old, value, ns) {
        if (key === "key" || value == null || isLifecycleMethod(key) || old === value && !isFormAttribute(vnode3, key) && typeof value !== "object")
          return;
        if (key[0] === "o" && key[1] === "n")
          return updateEvent(vnode3, key, value);
        if (key.slice(0, 6) === "xlink:")
          vnode3.dom.setAttributeNS("http://www.w3.org/1999/xlink", key.slice(6), value);
        else if (key === "style")
          updateStyle(vnode3.dom, old, value);
        else if (hasPropertyKey(vnode3, key, ns)) {
          if (key === "value") {
            if ((vnode3.tag === "input" || vnode3.tag === "textarea") && vnode3.dom.value === "" + value)
              return;
            if (vnode3.tag === "select" && old !== null && vnode3.dom.value === "" + value)
              return;
            if (vnode3.tag === "option" && old !== null && vnode3.dom.value === "" + value)
              return;
            if (vnode3.tag === "input" && vnode3.attrs.type === "file" && "" + value !== "") {
              console.error("`value` is read-only on file inputs!");
              return;
            }
          }
          if (vnode3.tag === "input" && key === "type")
            vnode3.dom.setAttribute(key, value);
          else
            vnode3.dom[key] = value;
        } else {
          if (typeof value === "boolean") {
            if (value)
              vnode3.dom.setAttribute(key, "");
            else
              vnode3.dom.removeAttribute(key);
          } else
            vnode3.dom.setAttribute(key === "className" ? "class" : key, value);
        }
      }
      function removeAttr(vnode3, key, old, ns) {
        if (key === "key" || old == null || isLifecycleMethod(key))
          return;
        if (key[0] === "o" && key[1] === "n")
          updateEvent(vnode3, key, undefined);
        else if (key === "style")
          updateStyle(vnode3.dom, old, null);
        else if (hasPropertyKey(vnode3, key, ns) && key !== "className" && key !== "title" && !(key === "value" && (vnode3.tag === "option" || vnode3.tag === "select" && vnode3.dom.selectedIndex === -1 && vnode3.dom === activeElement(vnode3.dom))) && !(vnode3.tag === "input" && key === "type")) {
          vnode3.dom[key] = null;
        } else {
          var nsLastIndex = key.indexOf(":");
          if (nsLastIndex !== -1)
            key = key.slice(nsLastIndex + 1);
          if (old !== false)
            vnode3.dom.removeAttribute(key === "className" ? "class" : key);
        }
      }
      function setLateSelectAttrs(vnode3, attrs5) {
        if ("value" in attrs5) {
          if (attrs5.value === null) {
            if (vnode3.dom.selectedIndex !== -1)
              vnode3.dom.value = null;
          } else {
            var normalized = "" + attrs5.value;
            if (vnode3.dom.value !== normalized || vnode3.dom.selectedIndex === -1) {
              vnode3.dom.value = normalized;
            }
          }
        }
        if ("selectedIndex" in attrs5)
          setAttr(vnode3, "selectedIndex", null, attrs5.selectedIndex, undefined);
      }
      function updateAttrs(vnode3, old, attrs5, ns) {
        var val;
        if (old != null) {
          if (old === attrs5 && !cachedAttrsIsStaticMap.has(attrs5)) {
            console.warn("Don't reuse attrs object, use new object for every redraw, this will throw in next major");
          }
          for (var key in old) {
            if ((val = old[key]) != null && (attrs5 == null || attrs5[key] == null)) {
              removeAttr(vnode3, key, val, ns);
            }
          }
        }
        if (attrs5 != null) {
          for (var key in attrs5) {
            setAttr(vnode3, key, old && old[key], attrs5[key], ns);
          }
        }
      }
      function isFormAttribute(vnode3, attr) {
        return attr === "value" || attr === "checked" || attr === "selectedIndex" || attr === "selected" && (vnode3.dom === activeElement(vnode3.dom) || vnode3.tag === "option" && vnode3.dom.parentNode === activeElement(vnode3.dom));
      }
      function isLifecycleMethod(attr) {
        return attr === "oninit" || attr === "oncreate" || attr === "onupdate" || attr === "onremove" || attr === "onbeforeremove" || attr === "onbeforeupdate";
      }
      function hasPropertyKey(vnode3, key, ns) {
        return ns === undefined && (vnode3.tag.indexOf("-") > -1 || vnode3.is || key !== "href" && key !== "list" && key !== "form" && key !== "width" && key !== "height") && key in vnode3.dom;
      }
      function updateStyle(element, old, style) {
        if (old === style) {} else if (style == null) {
          element.style = "";
        } else if (typeof style !== "object") {
          element.style = style;
        } else if (old == null || typeof old !== "object") {
          element.style = "";
          for (var key in style) {
            var value = style[key];
            if (value != null) {
              if (key.includes("-"))
                element.style.setProperty(key, String(value));
              else
                element.style[key] = String(value);
            }
          }
        } else {
          for (var key in old) {
            if (old[key] != null && style[key] == null) {
              if (key.includes("-"))
                element.style.removeProperty(key);
              else
                element.style[key] = "";
            }
          }
          for (var key in style) {
            var value = style[key];
            if (value != null && (value = String(value)) !== String(old[key])) {
              if (key.includes("-"))
                element.style.setProperty(key, value);
              else
                element.style[key] = value;
            }
          }
        }
      }
      function EventDict() {
        this._ = currentRedraw;
      }
      EventDict.prototype = Object.create(null);
      EventDict.prototype.handleEvent = function(ev) {
        var handler = this["on" + ev.type];
        var result;
        if (typeof handler === "function")
          result = handler.call(ev.currentTarget, ev);
        else if (typeof handler.handleEvent === "function")
          handler.handleEvent(ev);
        var self = this;
        if (self._ != null) {
          if (ev.redraw !== false)
            (0, self._)();
          if (result != null && typeof result.then === "function") {
            Promise.resolve(result).then(function() {
              if (self._ != null && ev.redraw !== false)
                (0, self._)();
            });
          }
        }
        if (result === false) {
          ev.preventDefault();
          ev.stopPropagation();
        }
      };
      function updateEvent(vnode3, key, value) {
        if (vnode3.events != null) {
          vnode3.events._ = currentRedraw;
          if (vnode3.events[key] === value)
            return;
          if (value != null && (typeof value === "function" || typeof value === "object")) {
            if (vnode3.events[key] == null)
              vnode3.dom.addEventListener(key.slice(2), vnode3.events, false);
            vnode3.events[key] = value;
          } else {
            if (vnode3.events[key] != null)
              vnode3.dom.removeEventListener(key.slice(2), vnode3.events, false);
            vnode3.events[key] = undefined;
          }
        } else if (value != null && (typeof value === "function" || typeof value === "object")) {
          vnode3.events = new EventDict;
          vnode3.dom.addEventListener(key.slice(2), vnode3.events, false);
          vnode3.events[key] = value;
        }
      }
      function initLifecycle(source, vnode3, hooks) {
        if (typeof source.oninit === "function")
          callHook.call(source.oninit, vnode3);
        if (typeof source.oncreate === "function")
          hooks.push(callHook.bind(source.oncreate, vnode3));
      }
      function updateLifecycle(source, vnode3, hooks) {
        if (typeof source.onupdate === "function")
          hooks.push(callHook.bind(source.onupdate, vnode3));
      }
      function shouldNotUpdate(vnode3, old) {
        do {
          if (vnode3.attrs != null && typeof vnode3.attrs.onbeforeupdate === "function") {
            var force = callHook.call(vnode3.attrs.onbeforeupdate, vnode3, old);
            if (force !== undefined && !force)
              break;
          }
          if (typeof vnode3.tag !== "string" && typeof vnode3.state.onbeforeupdate === "function") {
            var force = callHook.call(vnode3.state.onbeforeupdate, vnode3, old);
            if (force !== undefined && !force)
              break;
          }
          return false;
        } while (false);
        vnode3.dom = old.dom;
        vnode3.domSize = old.domSize;
        vnode3.instance = old.instance;
        vnode3.attrs = old.attrs;
        vnode3.children = old.children;
        vnode3.text = old.text;
        return true;
      }
      var currentDOM;
      return function(dom, vnodes, redraw) {
        if (!dom)
          throw new TypeError("DOM element being rendered to does not exist.");
        if (currentDOM != null && dom.contains(currentDOM)) {
          throw new TypeError("Node is currently being rendered to and thus is locked.");
        }
        var prevRedraw = currentRedraw;
        var prevDOM = currentDOM;
        var hooks = [];
        var active = activeElement(dom);
        var namespace = dom.namespaceURI;
        currentDOM = dom;
        currentRedraw = typeof redraw === "function" ? redraw : undefined;
        currentRender = {};
        try {
          if (dom.vnodes == null)
            dom.textContent = "";
          vnodes = Vnode.normalizeChildren(Array.isArray(vnodes) ? vnodes : [vnodes]);
          updateNodes(dom, dom.vnodes, vnodes, hooks, null, namespace === "http://www.w3.org/1999/xhtml" ? undefined : namespace);
          dom.vnodes = vnodes;
          if (active != null && activeElement(dom) !== active && typeof active.focus === "function")
            active.focus();
          for (var i = 0;i < hooks.length; i++)
            hooks[i]();
        } finally {
          currentRedraw = prevRedraw;
          currentDOM = prevDOM;
        }
      };
    };
    var render = _14();
    var _21 = function(render2, schedule, console2) {
      var subscriptions = [];
      var pending = false;
      var offset = -1;
      function sync() {
        for (offset = 0;offset < subscriptions.length; offset += 2) {
          try {
            render2(subscriptions[offset], Vnode(subscriptions[offset + 1]), redraw);
          } catch (e) {
            console2.error(e);
          }
        }
        offset = -1;
      }
      function redraw() {
        if (!pending) {
          pending = true;
          schedule(function() {
            pending = false;
            sync();
          });
        }
      }
      redraw.sync = sync;
      function mount(root, component) {
        if (component != null && component.view == null && typeof component !== "function") {
          throw new TypeError("m.mount expects a component, not a vnode.");
        }
        var index = subscriptions.indexOf(root);
        if (index >= 0) {
          subscriptions.splice(index, 2);
          if (index <= offset)
            offset -= 2;
          render2(root, []);
        }
        if (component != null) {
          subscriptions.push(root, component);
          render2(root, Vnode(component), redraw);
        }
      }
      return { mount, redraw };
    };
    var mountRedraw = _21(render, typeof requestAnimationFrame !== "undefined" ? requestAnimationFrame : null, typeof console !== "undefined" ? console : null);
    var buildQueryString = function(object) {
      if (Object.prototype.toString.call(object) !== "[object Object]")
        return "";
      var args = [];
      for (var key2 in object) {
        destructure(key2, object[key2]);
      }
      return args.join("&");
      function destructure(key22, value1) {
        if (Array.isArray(value1)) {
          for (var i = 0;i < value1.length; i++) {
            destructure(key22 + "[" + i + "]", value1[i]);
          }
        } else if (Object.prototype.toString.call(value1) === "[object Object]") {
          for (var i in value1) {
            destructure(key22 + "[" + i + "]", value1[i]);
          }
        } else
          args.push(encodeURIComponent(key22) + (value1 != null && value1 !== "" ? "=" + encodeURIComponent(value1) : ""));
      }
    };
    var buildPathname = function(template, params) {
      if (/:([^\/\.-]+)(\.{3})?:/.test(template)) {
        throw new SyntaxError("Template parameter names must be separated by either a '/', '-', or '.'.");
      }
      if (params == null)
        return template;
      var queryIndex = template.indexOf("?");
      var hashIndex = template.indexOf("#");
      var queryEnd = hashIndex < 0 ? template.length : hashIndex;
      var pathEnd = queryIndex < 0 ? queryEnd : queryIndex;
      var path = template.slice(0, pathEnd);
      var query = {};
      Object.assign(query, params);
      var resolved = path.replace(/:([^\/\.-]+)(\.{3})?/g, function(m3, key1, variadic) {
        delete query[key1];
        if (params[key1] == null)
          return m3;
        return variadic ? params[key1] : encodeURIComponent(String(params[key1]));
      });
      var newQueryIndex = resolved.indexOf("?");
      var newHashIndex = resolved.indexOf("#");
      var newQueryEnd = newHashIndex < 0 ? resolved.length : newHashIndex;
      var newPathEnd = newQueryIndex < 0 ? newQueryEnd : newQueryIndex;
      var result0 = resolved.slice(0, newPathEnd);
      if (queryIndex >= 0)
        result0 += template.slice(queryIndex, queryEnd);
      if (newQueryIndex >= 0)
        result0 += (queryIndex < 0 ? "?" : "&") + resolved.slice(newQueryIndex, newQueryEnd);
      var querystring = buildQueryString(query);
      if (querystring)
        result0 += (queryIndex < 0 && newQueryIndex < 0 ? "?" : "&") + querystring;
      if (hashIndex >= 0)
        result0 += template.slice(hashIndex);
      if (newHashIndex >= 0)
        result0 += (hashIndex < 0 ? "" : "&") + resolved.slice(newHashIndex);
      return result0;
    };
    var _25 = function($window, oncompletion) {
      function PromiseProxy(executor) {
        return new Promise(executor);
      }
      function makeRequest(url, args) {
        return new Promise(function(resolve, reject) {
          url = buildPathname(url, args.params);
          var method = args.method != null ? args.method.toUpperCase() : "GET";
          var body = args.body;
          var assumeJSON = (args.serialize == null || args.serialize === JSON.serialize) && !(body instanceof $window.FormData || body instanceof $window.URLSearchParams);
          var responseType = args.responseType || (typeof args.extract === "function" ? "" : "json");
          var xhr = new $window.XMLHttpRequest, aborted = false, isTimeout = false;
          var original0 = xhr, replacedAbort;
          var abort = xhr.abort;
          xhr.abort = function() {
            aborted = true;
            abort.call(this);
          };
          xhr.open(method, url, args.async !== false, typeof args.user === "string" ? args.user : undefined, typeof args.password === "string" ? args.password : undefined);
          if (assumeJSON && body != null && !hasHeader(args, "content-type")) {
            xhr.setRequestHeader("Content-Type", "application/json; charset=utf-8");
          }
          if (typeof args.deserialize !== "function" && !hasHeader(args, "accept")) {
            xhr.setRequestHeader("Accept", "application/json, text/*");
          }
          if (args.withCredentials)
            xhr.withCredentials = args.withCredentials;
          if (args.timeout)
            xhr.timeout = args.timeout;
          xhr.responseType = responseType;
          for (var key0 in args.headers) {
            if (hasOwn.call(args.headers, key0)) {
              xhr.setRequestHeader(key0, args.headers[key0]);
            }
          }
          xhr.onreadystatechange = function(ev) {
            if (aborted)
              return;
            if (ev.target.readyState === 4) {
              try {
                var success = ev.target.status >= 200 && ev.target.status < 300 || ev.target.status === 304 || /^file:\/\//i.test(url);
                var response = ev.target.response, message;
                if (responseType === "json") {
                  if (!ev.target.responseType && typeof args.extract !== "function") {
                    try {
                      response = JSON.parse(ev.target.responseText);
                    } catch (e) {
                      response = null;
                    }
                  }
                } else if (!responseType || responseType === "text") {
                  if (response == null)
                    response = ev.target.responseText;
                }
                if (typeof args.extract === "function") {
                  response = args.extract(ev.target, args);
                  success = true;
                } else if (typeof args.deserialize === "function") {
                  response = args.deserialize(response);
                }
                if (success) {
                  if (typeof args.type === "function") {
                    if (Array.isArray(response)) {
                      for (var i = 0;i < response.length; i++) {
                        response[i] = new args.type(response[i]);
                      }
                    } else
                      response = new args.type(response);
                  }
                  resolve(response);
                } else {
                  var completeErrorResponse = function() {
                    try {
                      message = ev.target.responseText;
                    } catch (e) {
                      message = response;
                    }
                    var error = new Error(message);
                    error.code = ev.target.status;
                    error.response = response;
                    reject(error);
                  };
                  if (xhr.status === 0) {
                    setTimeout(function() {
                      if (isTimeout)
                        return;
                      completeErrorResponse();
                    });
                  } else
                    completeErrorResponse();
                }
              } catch (e) {
                reject(e);
              }
            }
          };
          xhr.ontimeout = function(ev) {
            isTimeout = true;
            var error = new Error("Request timed out");
            error.code = ev.target.status;
            reject(error);
          };
          if (typeof args.config === "function") {
            xhr = args.config(xhr, args, url) || xhr;
            if (xhr !== original0) {
              replacedAbort = xhr.abort;
              xhr.abort = function() {
                aborted = true;
                replacedAbort.call(this);
              };
            }
          }
          if (body == null)
            xhr.send();
          else if (typeof args.serialize === "function")
            xhr.send(args.serialize(body));
          else if (body instanceof $window.FormData || body instanceof $window.URLSearchParams)
            xhr.send(body);
          else
            xhr.send(JSON.stringify(body));
        });
      }
      PromiseProxy.prototype = Promise.prototype;
      PromiseProxy.__proto__ = Promise;
      function hasHeader(args, name) {
        for (var key0 in args.headers) {
          if (hasOwn.call(args.headers, key0) && key0.toLowerCase() === name)
            return true;
        }
        return false;
      }
      return {
        request: function(url, args) {
          if (typeof url !== "string") {
            args = url;
            url = url.url;
          } else if (args == null)
            args = {};
          var promise = makeRequest(url, args);
          if (args.background === true)
            return promise;
          var count = 0;
          function complete() {
            if (--count === 0 && typeof oncompletion === "function")
              oncompletion();
          }
          return wrap(promise);
          function wrap(promise2) {
            var then = promise2.then;
            promise2.constructor = PromiseProxy;
            promise2.then = function() {
              count++;
              var next = then.apply(promise2, arguments);
              next.then(complete, function(e) {
                complete();
                if (count === 0)
                  throw e;
              });
              return wrap(next);
            };
            return promise2;
          }
        }
      };
    };
    var request = _25(typeof window !== "undefined" ? window : null, mountRedraw.redraw);
    var validUtf8Encodings = /%(?:[0-7]|(?!c[01]|e0%[89]|ed%[ab]|f0%8|f4%[9ab])(?:c|d|(?:e|f[0-4]%[89ab])[\da-f]%[89ab])[\da-f]%[89ab])[\da-f]/gi;
    var decodeURIComponentSafe = function(str) {
      return String(str).replace(validUtf8Encodings, decodeURIComponent);
    };
    var parseQueryString = function(string) {
      if (string === "" || string == null)
        return {};
      if (string.charAt(0) === "?")
        string = string.slice(1);
      var entries = string.split("&"), counters = {}, data0 = {};
      for (var i = 0;i < entries.length; i++) {
        var entry = entries[i].split("=");
        var key4 = decodeURIComponentSafe(entry[0]);
        var value2 = entry.length === 2 ? decodeURIComponentSafe(entry[1]) : "";
        if (value2 === "true")
          value2 = true;
        else if (value2 === "false")
          value2 = false;
        var levels = key4.split(/\]\[?|\[/);
        var cursor = data0;
        if (key4.indexOf("[") > -1)
          levels.pop();
        for (var j0 = 0;j0 < levels.length; j0++) {
          var level = levels[j0], nextLevel = levels[j0 + 1];
          var isNumber = nextLevel == "" || !isNaN(parseInt(nextLevel, 10));
          if (level === "") {
            var key4 = levels.slice(0, j0).join();
            if (counters[key4] == null) {
              counters[key4] = Array.isArray(cursor) ? cursor.length : 0;
            }
            level = counters[key4]++;
          } else if (level === "__proto__")
            break;
          if (j0 === levels.length - 1)
            cursor[level] = value2;
          else {
            var desc = Object.getOwnPropertyDescriptor(cursor, level);
            if (desc != null)
              desc = desc.value;
            if (desc == null)
              cursor[level] = desc = isNumber ? [] : {};
            cursor = desc;
          }
        }
      }
      return data0;
    };
    var parsePathname = function(url) {
      var queryIndex0 = url.indexOf("?");
      var hashIndex0 = url.indexOf("#");
      var queryEnd0 = hashIndex0 < 0 ? url.length : hashIndex0;
      var pathEnd0 = queryIndex0 < 0 ? queryEnd0 : queryIndex0;
      var path1 = url.slice(0, pathEnd0).replace(/\/{2,}/g, "/");
      if (!path1)
        path1 = "/";
      else {
        if (path1[0] !== "/")
          path1 = "/" + path1;
      }
      return {
        path: path1,
        params: queryIndex0 < 0 ? {} : parseQueryString(url.slice(queryIndex0 + 1, queryEnd0))
      };
    };
    var compileTemplate = function(template) {
      var templateData = parsePathname(template);
      var templateKeys = Object.keys(templateData.params);
      var keys = [];
      var regexp = new RegExp("^" + templateData.path.replace(/:([^\/.-]+)(\.{3}|\.(?!\.)|-)?|[\\^$*+.()|\[\]{}]/g, function(m4, key5, extra) {
        if (key5 == null)
          return "\\" + m4;
        keys.push({ k: key5, r: extra === "..." });
        if (extra === "...")
          return "(.*)";
        if (extra === ".")
          return "([^/]+)\\.";
        return "([^/]+)" + (extra || "");
      }) + "\\/?$");
      return function(data1) {
        for (var i = 0;i < templateKeys.length; i++) {
          if (templateData.params[templateKeys[i]] !== data1.params[templateKeys[i]])
            return false;
        }
        if (!keys.length)
          return regexp.test(data1.path);
        var values = regexp.exec(data1.path);
        if (values == null)
          return false;
        for (var i = 0;i < keys.length; i++) {
          data1.params[keys[i].k] = keys[i].r ? values[i + 1] : decodeURIComponent(values[i + 1]);
        }
        return true;
      };
    };
    var magic = /^(?:key|oninit|oncreate|onbeforeupdate|onupdate|onbeforeremove|onremove)$/;
    var censor = function(attrs7, extras) {
      var result2 = {};
      if (extras != null) {
        for (var key6 in attrs7) {
          if (hasOwn.call(attrs7, key6) && !magic.test(key6) && extras.indexOf(key6) < 0) {
            result2[key6] = attrs7[key6];
          }
        }
      } else {
        for (var key6 in attrs7) {
          if (hasOwn.call(attrs7, key6) && !magic.test(key6)) {
            result2[key6] = attrs7[key6];
          }
        }
      }
      return result2;
    };
    var _31 = function($window, mountRedraw0) {
      var p = Promise.resolve();
      var scheduled = false;
      var ready = false;
      var hasBeenResolved = false;
      var dom0, compiled, fallbackRoute;
      var currentResolver, component, attrs6, currentPath, lastUpdate;
      var RouterRoot = {
        onremove: function() {
          ready = hasBeenResolved = false;
          $window.removeEventListener("popstate", fireAsync, false);
        },
        view: function() {
          var vnode6 = Vnode(component, attrs6.key, attrs6);
          if (currentResolver)
            return currentResolver.render(vnode6);
          return [vnode6];
        }
      };
      var SKIP = route.SKIP = {};
      function resolveRoute() {
        scheduled = false;
        var prefix = $window.location.hash;
        if (route.prefix[0] !== "#") {
          prefix = $window.location.search + prefix;
          if (route.prefix[0] !== "?") {
            prefix = $window.location.pathname + prefix;
            if (prefix[0] !== "/")
              prefix = "/" + prefix;
          }
        }
        var path0 = decodeURIComponentSafe(prefix).slice(route.prefix.length);
        var data = parsePathname(path0);
        Object.assign(data.params, $window.history.state);
        function reject(e) {
          console.error(e);
          route.set(fallbackRoute, null, { replace: true });
        }
        loop(0);
        function loop(i) {
          for (;i < compiled.length; i++) {
            if (compiled[i].check(data)) {
              var payload = compiled[i].component;
              var matchedRoute = compiled[i].route;
              var localComp = payload;
              var update = lastUpdate = function(comp) {
                if (update !== lastUpdate)
                  return;
                if (comp === SKIP)
                  return loop(i + 1);
                component = comp != null && (typeof comp.view === "function" || typeof comp === "function") ? comp : "div";
                attrs6 = data.params, currentPath = path0, lastUpdate = null;
                currentResolver = payload.render ? payload : null;
                if (hasBeenResolved)
                  mountRedraw0.redraw();
                else {
                  hasBeenResolved = true;
                  mountRedraw0.mount(dom0, RouterRoot);
                }
              };
              if (payload.view || typeof payload === "function") {
                payload = {};
                update(localComp);
              } else if (payload.onmatch) {
                p.then(function() {
                  return payload.onmatch(data.params, path0, matchedRoute);
                }).then(update, path0 === fallbackRoute ? null : reject);
              } else
                update();
              return;
            }
          }
          if (path0 === fallbackRoute) {
            throw new Error("Could not resolve default route " + fallbackRoute + ".");
          }
          route.set(fallbackRoute, null, { replace: true });
        }
      }
      function fireAsync() {
        if (!scheduled) {
          scheduled = true;
          setTimeout(resolveRoute);
        }
      }
      function route(root, defaultRoute, routes) {
        if (!root)
          throw new TypeError("DOM element being rendered to does not exist.");
        compiled = Object.keys(routes).map(function(route2) {
          if (route2[0] !== "/")
            throw new SyntaxError("Routes must start with a '/'.");
          if (/:([^\/\.-]+)(\.{3})?:/.test(route2)) {
            throw new SyntaxError("Route parameter names must be separated with either '/', '.', or '-'.");
          }
          return {
            route: route2,
            component: routes[route2],
            check: compileTemplate(route2)
          };
        });
        fallbackRoute = defaultRoute;
        if (defaultRoute != null) {
          var defaultData = parsePathname(defaultRoute);
          if (!compiled.some(function(i) {
            return i.check(defaultData);
          })) {
            throw new ReferenceError("Default route doesn't match any known routes.");
          }
        }
        dom0 = root;
        $window.addEventListener("popstate", fireAsync, false);
        ready = true;
        resolveRoute();
      }
      route.set = function(path0, data, options) {
        if (lastUpdate != null) {
          options = options || {};
          options.replace = true;
        }
        lastUpdate = null;
        path0 = buildPathname(path0, data);
        if (ready) {
          fireAsync();
          var state = options ? options.state : null;
          var title = options ? options.title : null;
          if (options && options.replace)
            $window.history.replaceState(state, title, route.prefix + path0);
          else
            $window.history.pushState(state, title, route.prefix + path0);
        } else {
          $window.location.href = route.prefix + path0;
        }
      };
      route.get = function() {
        return currentPath;
      };
      route.prefix = "#!";
      route.Link = {
        view: function(vnode6) {
          var child0 = hyperscript(vnode6.attrs.selector || "a", censor(vnode6.attrs, ["options", "params", "selector", "onclick"]), vnode6.children);
          var options, onclick, href;
          if (child0.attrs.disabled = Boolean(child0.attrs.disabled)) {
            child0.attrs.href = null;
            child0.attrs["aria-disabled"] = "true";
          } else {
            options = vnode6.attrs.options;
            onclick = vnode6.attrs.onclick;
            href = buildPathname(child0.attrs.href, vnode6.attrs.params);
            child0.attrs.href = route.prefix + href;
            child0.attrs.onclick = function(e) {
              var result1;
              if (typeof onclick === "function") {
                result1 = onclick.call(e.currentTarget, e);
              } else if (onclick == null || typeof onclick !== "object") {} else if (typeof onclick.handleEvent === "function") {
                onclick.handleEvent(e);
              }
              if (result1 !== false && !e.defaultPrevented && (e.button === 0 || e.which === 0 || e.which === 1) && (!e.currentTarget.target || e.currentTarget.target === "_self") && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey) {
                e.preventDefault();
                e.redraw = false;
                route.set(href, null, options);
              }
            };
          }
          return child0;
        }
      };
      route.param = function(key3) {
        return attrs6 && key3 != null ? attrs6[key3] : attrs6;
      };
      return route;
    };
    var router = _31(typeof window !== "undefined" ? window : null, mountRedraw);
    var m = function m() {
      return hyperscript.apply(this, arguments);
    };
    m.m = hyperscript;
    m.trust = hyperscript.trust;
    m.fragment = hyperscript.fragment;
    m.Fragment = "[";
    m.mount = mountRedraw.mount;
    m.route = router;
    m.render = render;
    m.redraw = mountRedraw.redraw;
    m.request = request.request;
    m.parseQueryString = parseQueryString;
    m.buildQueryString = buildQueryString;
    m.parsePathname = parsePathname;
    m.buildPathname = buildPathname;
    m.vnode = Vnode;
    m.censor = censor;
    m.domFor = domFor;
    if (typeof module !== "undefined")
      module["exports"] = m;
    else
      window.m = m;
  })();
});
export default require_mithril();
