// node_modules/esm-env/true.js
var true_default = true;
// node_modules/svelte/src/internal/shared/utils.js
var is_array = Array.isArray;
var index_of = Array.prototype.indexOf;
var includes = Array.prototype.includes;
var define_property = Object.defineProperty;
var get_descriptor = Object.getOwnPropertyDescriptor;
var object_prototype = Object.prototype;
var array_prototype = Array.prototype;
var get_prototype_of = Object.getPrototypeOf;
var noop = () => {};
function run_all(arr) {
  for (var i = 0;i < arr.length; i++) {
    arr[i]();
  }
}
function deferred() {
  var resolve;
  var reject;
  var promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// node_modules/svelte/src/internal/client/constants.js
var DERIVED = 1 << 1;
var EFFECT = 1 << 2;
var RENDER_EFFECT = 1 << 3;
var MANAGED_EFFECT = 1 << 24;
var BLOCK_EFFECT = 1 << 4;
var BRANCH_EFFECT = 1 << 5;
var ROOT_EFFECT = 1 << 6;
var BOUNDARY_EFFECT = 1 << 7;
var CONNECTED = 1 << 9;
var CLEAN = 1 << 10;
var DIRTY = 1 << 11;
var MAYBE_DIRTY = 1 << 12;
var INERT = 1 << 13;
var DESTROYED = 1 << 14;
var REACTION_RAN = 1 << 15;
var DESTROYING = 1 << 25;
var EFFECT_TRANSPARENT = 1 << 16;
var EAGER_EFFECT = 1 << 17;
var HEAD_EFFECT = 1 << 18;
var EFFECT_PRESERVED = 1 << 19;
var USER_EFFECT = 1 << 20;
var EFFECT_OFFSCREEN = 1 << 25;
var WAS_MARKED = 1 << 16;
var REACTION_IS_UPDATING = 1 << 21;
var ASYNC = 1 << 22;
var ERROR_VALUE = 1 << 23;
var STATE_SYMBOL = Symbol("$state");
var LEGACY_PROPS = Symbol("legacy props");
var LOADING_ATTR_SYMBOL = Symbol("");
var PROXY_PATH_SYMBOL = Symbol("proxy path");
var ATTRIBUTES_CACHE = Symbol("attributes");
var CLASS_CACHE = Symbol("class");
var STYLE_CACHE = Symbol("style");
var TEXT_CACHE = Symbol("text");
var FORM_RESET_HANDLER = Symbol("form reset");
var HMR_ANCHOR = Symbol("hmr anchor");
var STALE_REACTION = new class StaleReactionError extends Error {
  name = "StaleReactionError";
  message = "The reaction that called `getAbortSignal()` was re-run or destroyed";
};
var IS_XHTML = !!globalThis.document?.contentType && /* @__PURE__ */ globalThis.document.contentType.includes("xml");
var COMMENT_NODE = 8;

// node_modules/svelte/src/internal/client/reactivity/equality.js
function equals(value) {
  return value === this.v;
}
function safe_not_equal(a, b) {
  return a != a ? b == b : a !== b || a !== null && typeof a === "object" || typeof a === "function";
}

// node_modules/svelte/src/internal/shared/errors.js
function invariant_violation(message) {
  if (true_default) {
    const error = new Error(`invariant_violation
An invariant violation occurred, meaning Svelte's internal assumptions were flawed. This is a bug in Svelte, not your app — please open an issue at https://github.com/sveltejs/svelte, citing the following message: "${message}"
https://svelte.dev/e/invariant_violation`);
    error.name = "Svelte error";
    throw error;
  } else {
    throw new Error(`https://svelte.dev/e/invariant_violation`);
  }
}
// node_modules/svelte/src/internal/client/errors.js
function derived_references_self() {
  if (true_default) {
    const error = new Error(`derived_references_self
A derived value cannot reference itself recursively
https://svelte.dev/e/derived_references_self`);
    error.name = "Svelte error";
    throw error;
  } else {
    throw new Error(`https://svelte.dev/e/derived_references_self`);
  }
}
function effect_update_depth_exceeded() {
  if (true_default) {
    const error = new Error(`effect_update_depth_exceeded
Maximum update depth exceeded. This typically indicates that an effect reads and writes the same piece of state
https://svelte.dev/e/effect_update_depth_exceeded`);
    error.name = "Svelte error";
    throw error;
  } else {
    throw new Error(`https://svelte.dev/e/effect_update_depth_exceeded`);
  }
}
function state_descriptors_fixed() {
  if (true_default) {
    const error = new Error(`state_descriptors_fixed
Property descriptors defined on \`$state\` objects must contain \`value\` and always be \`enumerable\`, \`configurable\` and \`writable\`.
https://svelte.dev/e/state_descriptors_fixed`);
    error.name = "Svelte error";
    throw error;
  } else {
    throw new Error(`https://svelte.dev/e/state_descriptors_fixed`);
  }
}
function state_prototype_fixed() {
  if (true_default) {
    const error = new Error(`state_prototype_fixed
Cannot set prototype of \`$state\` object
https://svelte.dev/e/state_prototype_fixed`);
    error.name = "Svelte error";
    throw error;
  } else {
    throw new Error(`https://svelte.dev/e/state_prototype_fixed`);
  }
}
function state_unsafe_mutation() {
  if (true_default) {
    const error = new Error(`state_unsafe_mutation
Updating state inside \`$derived(...)\`, \`$inspect(...)\` or a template expression is forbidden. If the value should not be reactive, declare it without \`$state\`
https://svelte.dev/e/state_unsafe_mutation`);
    error.name = "Svelte error";
    throw error;
  } else {
    throw new Error(`https://svelte.dev/e/state_unsafe_mutation`);
  }
}
function svelte_boundary_reset_onerror() {
  if (true_default) {
    const error = new Error(`svelte_boundary_reset_onerror
A \`<svelte:boundary>\` \`reset\` function cannot be called while an error is still being handled
https://svelte.dev/e/svelte_boundary_reset_onerror`);
    error.name = "Svelte error";
    throw error;
  } else {
    throw new Error(`https://svelte.dev/e/svelte_boundary_reset_onerror`);
  }
}

// node_modules/svelte/src/internal/flags/index.js
var async_mode_flag = false;
var legacy_mode_flag = false;
var tracing_mode_flag = false;

// node_modules/svelte/src/constants.js
var EACH_INDEX_REACTIVE = 1 << 1;
var EACH_IS_CONTROLLED = 1 << 2;
var EACH_IS_ANIMATED = 1 << 3;
var EACH_ITEM_IMMUTABLE = 1 << 4;
var PROPS_IS_RUNES = 1 << 1;
var PROPS_IS_UPDATED = 1 << 2;
var PROPS_IS_BINDABLE = 1 << 3;
var PROPS_IS_LAZY_INITIAL = 1 << 4;
var TRANSITION_OUT = 1 << 1;
var TRANSITION_GLOBAL = 1 << 2;
var TEMPLATE_USE_IMPORT_NODE = 1 << 1;
var TEMPLATE_USE_SVG = 1 << 2;
var TEMPLATE_USE_MATHML = 1 << 3;
var HYDRATION_START = "[";
var HYDRATION_START_ELSE = "[!";
var HYDRATION_START_FAILED = "[?";
var HYDRATION_END = "]";
var HYDRATION_ERROR = {};
var ELEMENT_PRESERVE_ATTRIBUTE_CASE = 1 << 1;
var ELEMENT_IS_INPUT = 1 << 2;
var UNINITIALIZED = Symbol("uninitialized");
var FILENAME = Symbol("filename");
var HMR = Symbol("hmr");

// node_modules/svelte/src/internal/client/dev/tracing.js
var tracing_expressions = null;
function tag(source, label) {
  source.label = label;
  tag_proxy(source.v, label);
  return source;
}
function tag_proxy(value, label) {
  value?.[PROXY_PATH_SYMBOL]?.(label);
  return value;
}

// node_modules/svelte/src/internal/shared/dev.js
function get_error(label) {
  const error = new Error;
  const stack = get_stack();
  if (stack.length === 0) {
    return null;
  }
  stack.unshift(`
`);
  define_property(error, "stack", {
    value: stack.join(`
`)
  });
  define_property(error, "name", {
    value: label
  });
  return error;
}
function get_stack() {
  const limit = Error.stackTraceLimit;
  Error.stackTraceLimit = Infinity;
  const stack = new Error().stack;
  Error.stackTraceLimit = limit;
  if (!stack)
    return [];
  const lines = stack.split(`
`);
  const new_lines = [];
  for (let i = 0;i < lines.length; i++) {
    const line = lines[i];
    const posixified = line.replaceAll("\\", "/");
    if (line.trim() === "Error") {
      continue;
    }
    if (line.includes("validate_each_keys")) {
      return [];
    }
    if (posixified.includes("svelte/src/internal") || posixified.includes("node_modules/.vite")) {
      continue;
    }
    new_lines.push(line);
  }
  return new_lines;
}
function invariant(condition, message) {
  if (!true_default) {
    throw new Error("invariant(...) was not guarded by if (DEV)");
  }
  if (!condition)
    invariant_violation(message);
}

// node_modules/svelte/src/internal/client/context.js
var component_context = null;
function set_component_context(context) {
  component_context = context;
}
var dev_stack = null;
function set_dev_stack(stack) {
  dev_stack = stack;
}
var dev_current_component_function = null;
function set_dev_current_component_function(fn) {
  dev_current_component_function = fn;
}
function is_runes() {
  return !legacy_mode_flag || component_context !== null && component_context.l === null;
}

// node_modules/svelte/src/internal/client/dom/task.js
var micro_tasks = [];
function run_micro_tasks() {
  var tasks = micro_tasks;
  micro_tasks = [];
  run_all(tasks);
}
function queue_micro_task(fn) {
  if (micro_tasks.length === 0 && !is_flushing_sync) {
    var tasks = micro_tasks;
    queueMicrotask(() => {
      if (tasks === micro_tasks)
        run_micro_tasks();
    });
  }
  micro_tasks.push(fn);
}

// node_modules/svelte/src/internal/client/warnings.js
var bold = "font-weight: bold";
var normal = "font-weight: normal";
function await_reactivity_loss(name) {
  if (true_default) {
    console.warn(`%c[svelte] await_reactivity_loss
%cDetected reactivity loss when reading \`${name}\`. This happens when state is read in an async function after an earlier \`await\`
https://svelte.dev/e/await_reactivity_loss`, bold, normal);
  } else {
    console.warn(`https://svelte.dev/e/await_reactivity_loss`);
  }
}
function derived_inert() {
  if (true_default) {
    console.warn(`%c[svelte] derived_inert
%cReading a derived belonging to a now-destroyed effect may result in stale values
https://svelte.dev/e/derived_inert`, bold, normal);
  } else {
    console.warn(`https://svelte.dev/e/derived_inert`);
  }
}
function hydration_mismatch(location) {
  if (true_default) {
    console.warn(`%c[svelte] hydration_mismatch
%c${location ? `Hydration failed because the initial UI does not match what was rendered on the server. The error occurred near ${location}` : "Hydration failed because the initial UI does not match what was rendered on the server"}
https://svelte.dev/e/hydration_mismatch`, bold, normal);
  } else {
    console.warn(`https://svelte.dev/e/hydration_mismatch`);
  }
}
function svelte_boundary_reset_noop() {
  if (true_default) {
    console.warn(`%c[svelte] svelte_boundary_reset_noop
%cA \`<svelte:boundary>\` \`reset\` function only resets the boundary the first time it is called
https://svelte.dev/e/svelte_boundary_reset_noop`, bold, normal);
  } else {
    console.warn(`https://svelte.dev/e/svelte_boundary_reset_noop`);
  }
}

// node_modules/svelte/src/internal/client/dom/hydration.js
var hydrating = false;
var hydrate_node;
function set_hydrate_node(node) {
  if (node === null) {
    hydration_mismatch();
    throw HYDRATION_ERROR;
  }
  return hydrate_node = node;
}
function hydrate_next() {
  return set_hydrate_node(get_next_sibling(hydrate_node));
}
function next(count = 1) {
  if (hydrating) {
    var i = count;
    var node = hydrate_node;
    while (i--) {
      node = get_next_sibling(node);
    }
    hydrate_node = node;
  }
}
function skip_nodes(remove = true) {
  var depth = 0;
  var node = hydrate_node;
  while (true) {
    if (node.nodeType === COMMENT_NODE) {
      var data = node.data;
      if (data === HYDRATION_END) {
        if (depth === 0)
          return node;
        depth -= 1;
      } else if (data === HYDRATION_START || data === HYDRATION_START_ELSE || data[0] === "[" && !isNaN(Number(data.slice(1)))) {
        depth += 1;
      }
    }
    var next2 = get_next_sibling(node);
    if (remove)
      node.remove();
    node = next2;
  }
}

// node_modules/svelte/src/internal/client/proxy.js
var regex_is_valid_identifier = /^[a-zA-Z_$][a-zA-Z_$0-9]*$/;
function proxy(value) {
  if (typeof value !== "object" || value === null || STATE_SYMBOL in value) {
    return value;
  }
  const prototype = get_prototype_of(value);
  if (prototype !== object_prototype && prototype !== array_prototype) {
    return value;
  }
  var sources = new Map;
  var is_proxied_array = is_array(value);
  var version = state(0);
  var stack = true_default && tracing_mode_flag ? get_error("created at") : null;
  var parent_version = update_version;
  var with_parent = (fn) => {
    if (update_version === parent_version) {
      return fn();
    }
    var reaction = active_reaction;
    var version2 = update_version;
    set_active_reaction(null);
    set_update_version(parent_version);
    var result = fn();
    set_active_reaction(reaction);
    set_update_version(version2);
    return result;
  };
  if (is_proxied_array) {
    sources.set("length", state(value.length, stack));
    if (true_default) {
      value = inspectable_array(value);
    }
  }
  var path = "";
  let updating = false;
  function update_path(new_path) {
    if (updating)
      return;
    updating = true;
    path = new_path;
    tag(version, `${path} version`);
    for (const [prop, source] of sources) {
      tag(source, get_label(path, prop));
    }
    updating = false;
  }
  return new Proxy(value, {
    defineProperty(_, prop, descriptor) {
      if (!("value" in descriptor) || descriptor.configurable === false || descriptor.enumerable === false || descriptor.writable === false) {
        state_descriptors_fixed();
      }
      var s = sources.get(prop);
      if (s === undefined) {
        with_parent(() => {
          var s2 = state(descriptor.value, stack);
          sources.set(prop, s2);
          if (true_default && typeof prop === "string") {
            tag(s2, get_label(path, prop));
          }
          return s2;
        });
      } else {
        set(s, descriptor.value, true);
      }
      return true;
    },
    deleteProperty(target, prop) {
      var s = sources.get(prop);
      if (s === undefined) {
        if (prop in target) {
          const s2 = with_parent(() => state(UNINITIALIZED, stack));
          sources.set(prop, s2);
          increment(version);
          if (true_default) {
            tag(s2, get_label(path, prop));
          }
        }
      } else {
        set(s, UNINITIALIZED);
        increment(version);
      }
      return true;
    },
    get(target, prop, receiver) {
      if (prop === STATE_SYMBOL) {
        return value;
      }
      if (true_default && prop === PROXY_PATH_SYMBOL) {
        return update_path;
      }
      var s = sources.get(prop);
      var exists = prop in target;
      if (s === undefined && (!exists || get_descriptor(target, prop)?.writable)) {
        s = with_parent(() => {
          var p = proxy(exists ? target[prop] : UNINITIALIZED);
          var s2 = state(p, stack);
          if (true_default) {
            tag(s2, get_label(path, prop));
          }
          return s2;
        });
        sources.set(prop, s);
      }
      if (s !== undefined) {
        var v = get(s);
        return v === UNINITIALIZED ? undefined : v;
      }
      return Reflect.get(target, prop, receiver);
    },
    getOwnPropertyDescriptor(target, prop) {
      var descriptor = Reflect.getOwnPropertyDescriptor(target, prop);
      if (descriptor && "value" in descriptor) {
        var s = sources.get(prop);
        if (s)
          descriptor.value = get(s);
      } else if (descriptor === undefined) {
        var source = sources.get(prop);
        var value2 = source?.v;
        if (source !== undefined && value2 !== UNINITIALIZED) {
          return {
            enumerable: true,
            configurable: true,
            value: value2,
            writable: true
          };
        }
      }
      return descriptor;
    },
    has(target, prop) {
      if (prop === STATE_SYMBOL) {
        return true;
      }
      var s = sources.get(prop);
      var has = s !== undefined && s.v !== UNINITIALIZED || Reflect.has(target, prop);
      if (s !== undefined || active_effect !== null && (!has || get_descriptor(target, prop)?.writable)) {
        if (s === undefined) {
          s = with_parent(() => {
            var p = has ? proxy(target[prop]) : UNINITIALIZED;
            var s2 = state(p, stack);
            if (true_default) {
              tag(s2, get_label(path, prop));
            }
            return s2;
          });
          sources.set(prop, s);
        }
        var value2 = get(s);
        if (value2 === UNINITIALIZED) {
          return false;
        }
      }
      return has;
    },
    set(target, prop, value2, receiver) {
      var s = sources.get(prop);
      var has = prop in target;
      if (is_proxied_array && prop === "length") {
        for (var i = value2;i < s.v; i += 1) {
          var other_s = sources.get(i + "");
          if (other_s !== undefined) {
            set(other_s, UNINITIALIZED);
          } else if (i in target) {
            other_s = with_parent(() => state(UNINITIALIZED, stack));
            sources.set(i + "", other_s);
            if (true_default) {
              tag(other_s, get_label(path, i));
            }
          }
        }
      }
      if (s === undefined) {
        if (!has || get_descriptor(target, prop)?.writable) {
          s = with_parent(() => state(undefined, stack));
          if (true_default) {
            tag(s, get_label(path, prop));
          }
          set(s, proxy(value2));
          sources.set(prop, s);
        }
      } else {
        has = s.v !== UNINITIALIZED;
        var p = with_parent(() => proxy(value2));
        set(s, p);
      }
      var descriptor = Reflect.getOwnPropertyDescriptor(target, prop);
      if (descriptor?.set) {
        descriptor.set.call(receiver, value2);
      }
      if (!has) {
        if (is_proxied_array && typeof prop === "string") {
          var ls = sources.get("length");
          var n = Number(prop);
          if (Number.isInteger(n) && n >= ls.v) {
            set(ls, n + 1);
          }
        }
        increment(version);
      }
      return true;
    },
    ownKeys(target) {
      get(version);
      var own_keys = Reflect.ownKeys(target).filter((key2) => {
        var source2 = sources.get(key2);
        return source2 === undefined || source2.v !== UNINITIALIZED;
      });
      for (var [key, source] of sources) {
        if (source.v !== UNINITIALIZED && !(key in target)) {
          own_keys.push(key);
        }
      }
      return own_keys;
    },
    setPrototypeOf() {
      state_prototype_fixed();
    }
  });
}
function get_label(path, prop) {
  if (typeof prop === "symbol")
    return `${path}[Symbol(${prop.description ?? ""})]`;
  if (regex_is_valid_identifier.test(prop))
    return `${path}.${prop}`;
  return /^\d+$/.test(prop) ? `${path}[${prop}]` : `${path}['${prop}']`;
}
var ARRAY_MUTATING_METHODS = new Set([
  "copyWithin",
  "fill",
  "pop",
  "push",
  "reverse",
  "shift",
  "sort",
  "splice",
  "unshift"
]);
function inspectable_array(array) {
  return new Proxy(array, {
    get(target, prop, receiver) {
      var value = Reflect.get(target, prop, receiver);
      if (!ARRAY_MUTATING_METHODS.has(prop)) {
        return value;
      }
      return function(...args) {
        set_eager_effects_deferred();
        var result = value.apply(this, args);
        flush_eager_effects();
        return result;
      };
    }
  });
}

// node_modules/svelte/src/internal/client/dom/operations.js
var is_firefox;
var next_sibling_getter;
function create_text(value = "") {
  return document.createTextNode(value);
}
function get_next_sibling(node) {
  return next_sibling_getter.call(node);
}

// node_modules/svelte/src/internal/client/error-handling.js
var adjustments = new WeakMap;
function handle_error(error) {
  var effect = active_effect;
  if (effect === null) {
    active_reaction.f |= ERROR_VALUE;
    return error;
  }
  if (true_default && error instanceof Error && !adjustments.has(error)) {
    adjustments.set(error, get_adjustments(error, effect));
  }
  if ((effect.f & REACTION_RAN) === 0 && (effect.f & EFFECT) === 0) {
    if (true_default && !effect.parent && error instanceof Error) {
      apply_adjustments(error);
    }
    throw error;
  }
  invoke_error_boundary(error, effect);
}
function invoke_error_boundary(error, effect) {
  if (effect !== null && (effect.f & DESTROYED) !== 0) {
    return;
  }
  while (effect !== null) {
    if ((effect.f & BOUNDARY_EFFECT) !== 0) {
      if ((effect.f & REACTION_RAN) === 0) {
        throw error;
      }
      try {
        effect.b.error(error);
        return;
      } catch (e) {
        error = e;
      }
    }
    effect = effect.parent;
  }
  if (true_default && error instanceof Error) {
    apply_adjustments(error);
  }
  throw error;
}
function get_adjustments(error, effect) {
  const message_descriptor = get_descriptor(error, "message");
  if (message_descriptor && !message_descriptor.configurable)
    return;
  var indent = is_firefox ? "  " : "\t";
  var component_stack = `
${indent}in ${effect.fn?.name || "<unknown>"}`;
  var context = effect.ctx;
  while (context !== null) {
    component_stack += `
${indent}in ${context.function?.[FILENAME].split("/").pop()}`;
    context = context.p;
  }
  return {
    message: error.message + `
${component_stack}
`,
    stack: error.stack?.split(`
`).filter((line) => !line.includes("svelte/src/internal")).join(`
`)
  };
}
function apply_adjustments(error) {
  const adjusted = adjustments.get(error);
  if (adjusted) {
    define_property(error, "message", {
      value: adjusted.message
    });
    define_property(error, "stack", {
      value: adjusted.stack
    });
  }
}

// node_modules/svelte/src/internal/client/reactivity/status.js
var STATUS_MASK = ~(DIRTY | MAYBE_DIRTY | CLEAN);
function set_signal_status(signal, status) {
  signal.f = signal.f & STATUS_MASK | status;
}
function update_derived_status(derived) {
  if ((derived.f & CONNECTED) !== 0 || derived.deps === null) {
    set_signal_status(derived, CLEAN);
  } else {
    set_signal_status(derived, MAYBE_DIRTY);
  }
}

// node_modules/svelte/src/internal/client/reactivity/utils.js
function clear_marked(deps) {
  if (deps === null)
    return;
  for (const dep of deps) {
    if ((dep.f & DERIVED) === 0 || (dep.f & WAS_MARKED) === 0) {
      continue;
    }
    dep.f ^= WAS_MARKED;
    clear_marked(dep.deps);
  }
}
function defer_effect(effect, dirty_effects, maybe_dirty_effects) {
  if ((effect.f & DIRTY) !== 0) {
    dirty_effects.add(effect);
  } else if ((effect.f & MAYBE_DIRTY) !== 0) {
    maybe_dirty_effects.add(effect);
  }
  clear_marked(effect.deps);
  set_signal_status(effect, CLEAN);
}

// node_modules/svelte/src/store/utils.js
function subscribe_to_store(store, run, invalidate) {
  if (store == null) {
    run(undefined);
    if (invalidate)
      invalidate(undefined);
    return noop;
  }
  const unsub = untrack(() => store.subscribe(run, invalidate));
  return unsub.unsubscribe ? () => unsub.unsubscribe() : unsub;
}

// node_modules/svelte/src/store/shared/index.js
var subscriber_queue = [];
function readable(value, start) {
  return {
    subscribe: writable(value, start).subscribe
  };
}
function writable(value, start = noop) {
  let stop = null;
  const subscribers = new Set;
  function set2(new_value) {
    if (safe_not_equal(value, new_value)) {
      value = new_value;
      if (stop) {
        const run_queue = !subscriber_queue.length;
        for (const subscriber of subscribers) {
          subscriber[1]();
          subscriber_queue.push(subscriber, value);
        }
        if (run_queue) {
          for (let i = 0;i < subscriber_queue.length; i += 2) {
            subscriber_queue[i][0](subscriber_queue[i + 1]);
          }
          subscriber_queue.length = 0;
        }
      }
    }
  }
  function update(fn) {
    set2(fn(value));
  }
  function subscribe(run, invalidate = noop) {
    const subscriber = [run, invalidate];
    subscribers.add(subscriber);
    if (subscribers.size === 1) {
      stop = start(set2, update) || noop;
    }
    run(value);
    return () => {
      subscribers.delete(subscriber);
      if (subscribers.size === 0 && stop) {
        stop();
        stop = null;
      }
    };
  }
  return { set: set2, update, subscribe };
}
function derived(stores, fn, initial_value) {
  const single = !Array.isArray(stores);
  const stores_array = single ? [stores] : stores;
  if (!stores_array.every(Boolean)) {
    throw new Error("derived() expects stores as input, got a falsy value");
  }
  const auto = fn.length < 2;
  return readable(initial_value, (set2, update) => {
    let started = false;
    const values = [];
    let pending = 0;
    let cleanup = noop;
    const sync = () => {
      if (pending) {
        return;
      }
      cleanup();
      const result = fn(single ? values[0] : values, set2, update);
      if (auto) {
        set2(result);
      } else {
        cleanup = typeof result === "function" ? result : noop;
      }
    };
    const unsubscribers = stores_array.map((store, i) => subscribe_to_store(store, (value) => {
      values[i] = value;
      pending &= ~(1 << i);
      if (started) {
        sync();
      }
    }, () => {
      pending |= 1 << i;
    }));
    started = true;
    sync();
    return function stop() {
      run_all(unsubscribers);
      cleanup();
      started = false;
    };
  });
}
function readonly(store) {
  return {
    subscribe: store.subscribe.bind(store)
  };
}
function get2(store) {
  let value;
  subscribe_to_store(store, (_) => value = _)();
  return value;
}

// node_modules/svelte/src/internal/client/reactivity/store.js
var legacy_is_updating_store = false;
var IS_UNMOUNTED = Symbol("unmounted");

// node_modules/svelte/src/internal/client/dom/elements/bindings/shared.js
function without_reactive_context(fn) {
  var previous_reaction = active_reaction;
  var previous_effect = active_effect;
  set_active_reaction(null);
  set_active_effect(null);
  try {
    return fn();
  } finally {
    set_active_reaction(previous_reaction);
    set_active_effect(previous_effect);
  }
}

// node_modules/svelte/src/reactivity/create-subscriber.js
function createSubscriber(start) {
  let subscribers = 0;
  let version = source(0);
  let stop;
  if (true_default) {
    tag(version, "createSubscriber version");
  }
  return () => {
    if (effect_tracking()) {
      get(version);
      render_effect(() => {
        if (subscribers === 0) {
          stop = untrack(() => start(() => increment(version)));
        }
        subscribers += 1;
        return () => {
          queue_micro_task(() => {
            subscribers -= 1;
            if (subscribers === 0) {
              stop?.();
              stop = undefined;
              increment(version);
            }
          });
        };
      });
    }
  };
}

// node_modules/svelte/src/internal/client/dom/blocks/boundary.js
var flags = EFFECT_TRANSPARENT | EFFECT_PRESERVED;
class Boundary {
  parent;
  is_pending = false;
  transform_error;
  #anchor;
  #hydrate_open = hydrating ? hydrate_node : null;
  #props;
  #children;
  #effect;
  #main_effect = null;
  #pending_effect = null;
  #failed_effect = null;
  #offscreen_fragment = null;
  #local_pending_count = 0;
  #pending_count = 0;
  #pending_count_update_queued = false;
  #dirty_effects = new Set;
  #maybe_dirty_effects = new Set;
  #effect_pending = null;
  #effect_pending_subscriber = createSubscriber(() => {
    this.#effect_pending = source(this.#local_pending_count);
    if (true_default) {
      tag(this.#effect_pending, "$effect.pending()");
    }
    return () => {
      this.#effect_pending = null;
    };
  });
  constructor(node, props, children, transform_error) {
    this.#anchor = node;
    this.#props = props;
    this.#children = (anchor) => {
      var effect = active_effect;
      effect.b = this;
      effect.f |= BOUNDARY_EFFECT;
      children(anchor);
    };
    this.parent = active_effect.b;
    this.transform_error = transform_error ?? this.parent?.transform_error ?? ((e) => e);
    this.#effect = block(() => {
      if (hydrating) {
        const comment = this.#hydrate_open;
        hydrate_next();
        const server_rendered_pending = comment.data === HYDRATION_START_ELSE;
        const server_rendered_failed = comment.data.startsWith(HYDRATION_START_FAILED);
        if (server_rendered_failed) {
          const serialized_error = JSON.parse(comment.data.slice(HYDRATION_START_FAILED.length));
          this.#hydrate_failed_content(serialized_error);
        } else if (server_rendered_pending) {
          this.#hydrate_pending_content();
        } else {
          this.#hydrate_resolved_content();
        }
      } else {
        this.#render();
      }
    }, flags);
    if (hydrating) {
      this.#anchor = hydrate_node;
    }
  }
  #hydrate_resolved_content() {
    try {
      this.#main_effect = branch(() => this.#children(this.#anchor));
    } catch (error) {
      this.error(error);
    }
  }
  #hydrate_failed_content(error) {
    const failed = this.#props.failed;
    const { reset, invoke_onerror } = this.#create_reset(error);
    queue_micro_task(invoke_onerror);
    if (!failed)
      return;
    this.#failed_effect = branch(() => {
      failed(this.#anchor, () => error, () => reset);
    });
  }
  #create_reset(error) {
    var did_reset = false;
    var calling_on_error = false;
    const reset = () => {
      if (did_reset) {
        svelte_boundary_reset_noop();
        return;
      }
      did_reset = true;
      if (calling_on_error) {
        svelte_boundary_reset_onerror();
      }
      if (this.#failed_effect !== null) {
        pause_effect(this.#failed_effect, () => {
          this.#failed_effect = null;
        });
      }
      this.#run(() => {
        this.#render();
      });
    };
    const invoke_onerror = () => {
      try {
        calling_on_error = true;
        this.#props.onerror?.(error, reset);
        calling_on_error = false;
      } catch (err) {
        invoke_error_boundary(err, this.#effect && this.#effect.parent);
      }
    };
    return { reset, invoke_onerror };
  }
  #hydrate_pending_content() {
    const pending = this.#props.pending;
    if (!pending)
      return;
    this.is_pending = true;
    this.#pending_effect = branch(() => pending(this.#anchor));
    queue_micro_task(() => {
      var fragment = this.#offscreen_fragment = document.createDocumentFragment();
      var anchor = create_text();
      fragment.append(anchor);
      this.#main_effect = this.#run(() => {
        return branch(() => this.#children(anchor));
      });
      if (this.#pending_count === 0) {
        this.#anchor.before(fragment);
        this.#offscreen_fragment = null;
        pause_effect(this.#pending_effect, () => {
          this.#pending_effect = null;
        });
        this.#resolve(current_batch);
      }
    });
  }
  #render() {
    try {
      this.is_pending = this.has_pending_snippet();
      this.#pending_count = 0;
      this.#local_pending_count = 0;
      this.#main_effect = branch(() => {
        this.#children(this.#anchor);
      });
      if (this.#pending_count > 0) {
        var fragment = this.#offscreen_fragment = document.createDocumentFragment();
        move_effect(this.#main_effect, fragment);
        const pending = this.#props.pending;
        this.#pending_effect = branch(() => pending(this.#anchor));
      } else {
        this.#resolve(current_batch);
      }
    } catch (error) {
      this.error(error);
    }
  }
  #resolve(batch) {
    this.is_pending = false;
    batch.transfer_effects(this.#dirty_effects, this.#maybe_dirty_effects);
  }
  defer_effect(effect) {
    defer_effect(effect, this.#dirty_effects, this.#maybe_dirty_effects);
  }
  is_rendered() {
    return !this.is_pending && (!this.parent || this.parent.is_rendered());
  }
  has_pending_snippet() {
    return !!this.#props.pending;
  }
  #run(fn) {
    var previous_effect = active_effect;
    var previous_reaction = active_reaction;
    var previous_ctx = component_context;
    set_active_effect(this.#effect);
    set_active_reaction(this.#effect);
    set_component_context(this.#effect.ctx);
    try {
      Batch.ensure();
      return fn();
    } catch (e) {
      handle_error(e);
      return null;
    } finally {
      set_active_effect(previous_effect);
      set_active_reaction(previous_reaction);
      set_component_context(previous_ctx);
    }
  }
  #update_pending_count(d, batch) {
    if (!this.has_pending_snippet()) {
      if (this.parent) {
        this.parent.#update_pending_count(d, batch);
      }
      return;
    }
    this.#pending_count += d;
    if (this.#pending_count === 0) {
      this.#resolve(batch);
      if (this.#pending_effect) {
        pause_effect(this.#pending_effect, () => {
          this.#pending_effect = null;
        });
      }
      if (this.#offscreen_fragment) {
        this.#anchor.before(this.#offscreen_fragment);
        this.#offscreen_fragment = null;
      }
    }
  }
  update_pending_count(d, batch) {
    this.#update_pending_count(d, batch);
    this.#local_pending_count += d;
    if (!this.#effect_pending || this.#pending_count_update_queued)
      return;
    this.#pending_count_update_queued = true;
    queue_micro_task(() => {
      this.#pending_count_update_queued = false;
      if (this.#effect_pending) {
        internal_set(this.#effect_pending, this.#local_pending_count);
      }
    });
  }
  get_effect_pending() {
    this.#effect_pending_subscriber();
    return get(this.#effect_pending);
  }
  error(error) {
    if (!this.#props.onerror && !this.#props.failed) {
      throw error;
    }
    if (current_batch?.is_fork) {
      if (this.#main_effect)
        current_batch.skip_effect(this.#main_effect);
      if (this.#pending_effect)
        current_batch.skip_effect(this.#pending_effect);
      if (this.#failed_effect)
        current_batch.skip_effect(this.#failed_effect);
      current_batch.oncommit(() => {
        this.#handle_error(error);
      });
    } else {
      this.#handle_error(error);
    }
  }
  #handle_error(error) {
    if (this.#main_effect) {
      destroy_effect(this.#main_effect);
      this.#main_effect = null;
    }
    if (this.#pending_effect) {
      destroy_effect(this.#pending_effect);
      this.#pending_effect = null;
    }
    if (this.#failed_effect) {
      destroy_effect(this.#failed_effect);
      this.#failed_effect = null;
    }
    if (hydrating) {
      set_hydrate_node(this.#hydrate_open);
      next();
      set_hydrate_node(skip_nodes());
    }
    let failed = this.#props.failed;
    const handle_error_result = (transformed_error) => {
      const { reset, invoke_onerror } = this.#create_reset(transformed_error);
      invoke_onerror();
      if (failed) {
        this.#failed_effect = this.#run(() => {
          try {
            return branch(() => {
              var effect = active_effect;
              effect.b = this;
              effect.f |= BOUNDARY_EFFECT;
              failed(this.#anchor, () => transformed_error, () => reset);
            });
          } catch (error2) {
            invoke_error_boundary(error2, this.#effect.parent);
            return null;
          }
        });
      }
    };
    queue_micro_task(() => {
      var result;
      try {
        result = this.transform_error(error);
      } catch (e) {
        invoke_error_boundary(e, this.#effect && this.#effect.parent);
        return;
      }
      if (result !== null && typeof result === "object" && typeof result.then === "function") {
        result.then(handle_error_result, (e) => invoke_error_boundary(e, this.#effect && this.#effect.parent));
      } else {
        handle_error_result(result);
      }
    });
  }
}

// node_modules/svelte/src/internal/client/reactivity/deriveds.js
var reactivity_loss_tracker = null;
var recent_async_deriveds = new Set;
var OBSOLETE = Symbol("obsolete");
function destroy_derived_effects(derived3) {
  var effects = derived3.effects;
  if (effects !== null) {
    derived3.effects = null;
    for (var i = 0;i < effects.length; i += 1) {
      destroy_effect(effects[i]);
    }
  }
}
var stack = [];
function execute_derived(derived3) {
  var value;
  var prev_active_effect = active_effect;
  var parent = derived3.parent;
  if (!is_destroying_effect && parent !== null && derived3.v !== UNINITIALIZED && (parent.f & (DESTROYED | INERT)) !== 0) {
    derived_inert();
    return derived3.v;
  }
  set_active_effect(parent);
  if (true_default) {
    let prev_eager_effects = eager_effects;
    set_eager_effects(new Set);
    try {
      if (includes.call(stack, derived3)) {
        derived_references_self();
      }
      stack.push(derived3);
      derived3.f &= ~WAS_MARKED;
      destroy_derived_effects(derived3);
      value = update_reaction(derived3);
    } finally {
      set_active_effect(prev_active_effect);
      set_eager_effects(prev_eager_effects);
      stack.pop();
    }
  } else {
    try {
      derived3.f &= ~WAS_MARKED;
      destroy_derived_effects(derived3);
      value = update_reaction(derived3);
    } finally {
      set_active_effect(prev_active_effect);
    }
  }
  return value;
}
function update_derived(derived3) {
  var value = execute_derived(derived3);
  if (!derived3.equals(value)) {
    derived3.wv = increment_write_version();
    if (!current_batch?.is_fork || derived3.deps === null) {
      if (current_batch !== null) {
        current_batch.capture(derived3, value, true);
        previous_batch?.capture(derived3, value, true);
      } else {
        derived3.v = value;
      }
      if (derived3.deps === null) {
        set_signal_status(derived3, CLEAN);
        return;
      }
    }
  }
  if (is_destroying_effect) {
    return;
  }
  if (batch_values !== null) {
    if (effect_tracking() || current_batch?.is_fork) {
      batch_values.set(derived3, value);
    }
  } else {
    update_derived_status(derived3);
  }
}
function freeze_derived_effects(derived3) {
  if (derived3.effects === null)
    return;
  for (const e of derived3.effects) {
    if (e.teardown || e.ac) {
      e.teardown?.();
      if (e.ac !== null) {
        without_reactive_context(() => {
          e.ac.abort(STALE_REACTION);
          e.ac = null;
        });
      }
      if (e.fn !== null)
        e.teardown = noop;
      remove_reactions(e, 0);
      destroy_effect_children(e);
    }
  }
}
function unfreeze_derived_effects(derived3) {
  if (derived3.effects === null)
    return;
  for (const e of derived3.effects) {
    if (e.teardown && e.fn !== null) {
      update_effect(e);
    }
  }
}

// node_modules/svelte/src/internal/client/reactivity/batch.js
var first_batch = null;
var last_batch = null;
var current_batch = null;
var previous_batch = null;
var batch_values = null;
var last_scheduled_effect = null;
var is_flushing_sync = false;
var is_processing = false;
var collected_effects = null;
var legacy_updates = null;
var flush_count = 0;
var source_stacks = new Set;
var uid = 1;

class Batch {
  id = uid++;
  #started = false;
  linked = true;
  #prev = null;
  #next = null;
  async_deriveds = new Map;
  current = new Map;
  previous = new Map;
  #commit_callbacks = new Set;
  #discard_callbacks = new Set;
  #pending = 0;
  #blocking_pending = new Map;
  #deferred = null;
  #roots = [];
  #new_effects = [];
  #dirty_effects = new Set;
  #maybe_dirty_effects = new Set;
  #skipped_branches = new Map;
  #unskipped_branches = new Set;
  is_fork = false;
  #decrement_queued = false;
  constructor() {
    if (last_batch === null) {
      first_batch = last_batch = this;
    } else {
      last_batch.#next = this;
      this.#prev = last_batch;
    }
    last_batch = this;
  }
  #is_deferred() {
    if (this.is_fork)
      return true;
    for (const effect of this.#blocking_pending.keys()) {
      var e = effect;
      var skipped = false;
      while (e.parent !== null) {
        if (this.#skipped_branches.has(e)) {
          skipped = true;
          break;
        }
        e = e.parent;
      }
      if (!skipped) {
        return true;
      }
    }
    return false;
  }
  skip_effect(effect) {
    if (!this.#skipped_branches.has(effect)) {
      this.#skipped_branches.set(effect, { d: [], m: [] });
    }
    this.#unskipped_branches.delete(effect);
  }
  unskip_effect(effect, callback = (e) => this.schedule(e)) {
    var tracked = this.#skipped_branches.get(effect);
    if (tracked) {
      this.#skipped_branches.delete(effect);
      for (var e of tracked.d) {
        set_signal_status(e, DIRTY);
        callback(e);
      }
      for (e of tracked.m) {
        set_signal_status(e, MAYBE_DIRTY);
        callback(e);
      }
    }
    this.#unskipped_branches.add(effect);
  }
  #process() {
    this.#started = true;
    if (flush_count++ > 1000) {
      this.#unlink();
      infinite_loop_guard();
    }
    if (true_default) {
      for (const value of this.current.keys()) {
        source_stacks.add(value);
      }
    }
    for (const e of this.#dirty_effects) {
      this.#maybe_dirty_effects.delete(e);
      set_signal_status(e, DIRTY);
      this.schedule(e);
    }
    for (const e of this.#maybe_dirty_effects) {
      set_signal_status(e, MAYBE_DIRTY);
      this.schedule(e);
    }
    const roots = this.#roots;
    this.#roots = [];
    this.apply();
    var effects = collected_effects = [];
    var render_effects = [];
    var updates = legacy_updates = [];
    for (const root of roots) {
      try {
        this.#traverse(root, effects, render_effects);
      } catch (e) {
        reset_all(root);
        if (!this.#is_deferred())
          this.discard();
        throw e;
      }
    }
    current_batch = null;
    if (updates.length > 0) {
      var batch = Batch.ensure();
      for (const e of updates) {
        batch.schedule(e);
      }
    }
    collected_effects = null;
    legacy_updates = null;
    if (this.#is_deferred()) {
      this.#defer_effects(render_effects);
      this.#defer_effects(effects);
      for (const [e, t] of this.#skipped_branches) {
        reset_branch(e, t);
      }
      if (updates.length > 0) {
        current_batch.#process();
      }
      return;
    }
    const earlier_batch = this.#find_earlier_batch();
    if (earlier_batch) {
      this.#defer_effects(render_effects);
      this.#defer_effects(effects);
      earlier_batch.#merge(this);
      return;
    }
    this.#dirty_effects.clear();
    this.#maybe_dirty_effects.clear();
    for (const fn of this.#commit_callbacks)
      fn(this);
    this.#commit_callbacks.clear();
    previous_batch = this;
    flush_queued_effects(render_effects);
    flush_queued_effects(effects);
    previous_batch = null;
    this.#deferred?.resolve();
    var next_batch = current_batch;
    if (this.#pending === 0 && (this.#roots.length === 0 || next_batch !== null)) {
      this.#unlink();
      if (async_mode_flag) {
        this.#commit();
        current_batch = next_batch;
      }
    }
    if (this.#roots.length > 0) {
      if (next_batch !== null) {
        const batch2 = next_batch;
        batch2.#roots.push(...this.#roots.filter((r) => !batch2.#roots.includes(r)));
      } else {
        next_batch = this;
      }
    }
    if (next_batch !== null) {
      old_values.clear();
      next_batch.#process();
    }
  }
  #traverse(root, effects, render_effects) {
    root.f ^= CLEAN;
    var effect = root.first;
    while (effect !== null) {
      var flags2 = effect.f;
      var is_branch = (flags2 & (BRANCH_EFFECT | ROOT_EFFECT)) !== 0;
      var is_skippable_branch = is_branch && (flags2 & CLEAN) !== 0;
      var skip = is_skippable_branch || (flags2 & INERT) !== 0 || this.#skipped_branches.has(effect);
      if (!skip && effect.fn !== null) {
        if (is_branch) {
          effect.f ^= CLEAN;
        } else if ((flags2 & EFFECT) !== 0) {
          effects.push(effect);
        } else if (async_mode_flag && (flags2 & (RENDER_EFFECT | MANAGED_EFFECT)) !== 0) {
          render_effects.push(effect);
        } else if (is_dirty(effect)) {
          if ((flags2 & BLOCK_EFFECT) !== 0)
            this.#maybe_dirty_effects.add(effect);
          update_effect(effect);
        }
        var child = effect.first;
        if (child !== null) {
          effect = child;
          continue;
        }
      }
      while (effect !== null) {
        var next2 = effect.next;
        if (next2 !== null) {
          effect = next2;
          break;
        }
        effect = effect.parent;
      }
    }
  }
  #find_earlier_batch() {
    var batch = this.#prev;
    while (batch !== null) {
      if (!batch.is_fork) {
        for (const [value, [, is_derived]] of this.current) {
          if (batch.current.has(value) && !is_derived) {
            return batch;
          }
        }
      }
      batch = batch.#prev;
    }
    return null;
  }
  #merge(batch) {
    for (const [source2, value] of batch.current) {
      if (!this.previous.has(source2) && batch.previous.has(source2)) {
        this.previous.set(source2, batch.previous.get(source2));
      }
      this.current.set(source2, value);
    }
    for (const [effect, deferred2] of batch.async_deriveds) {
      const d = this.async_deriveds.get(effect);
      if (d)
        deferred2.promise.then(d.resolve).catch(d.reject);
    }
    batch.async_deriveds.clear();
    this.transfer_effects(batch.#dirty_effects, batch.#maybe_dirty_effects);
    const mark = (value) => {
      var reactions = value.reactions;
      if (reactions === null)
        return;
      if ((value.f & DERIVED) !== 0 && (value.f & (DIRTY | MAYBE_DIRTY)) === 0) {
        return;
      }
      for (const reaction of reactions) {
        var flags2 = reaction.f;
        if ((flags2 & DERIVED) !== 0) {
          mark(reaction);
        } else {
          var effect = reaction;
          if (flags2 & (ASYNC | BLOCK_EFFECT) && !this.async_deriveds.has(effect)) {
            this.#maybe_dirty_effects.delete(effect);
            set_signal_status(effect, DIRTY);
            this.schedule(effect);
          }
        }
      }
    };
    for (const source2 of this.current.keys()) {
      mark(source2);
    }
    this.oncommit(() => batch.discard());
    batch.#unlink();
    current_batch = this;
    this.#process();
  }
  #defer_effects(effects) {
    for (var i = 0;i < effects.length; i += 1) {
      defer_effect(effects[i], this.#dirty_effects, this.#maybe_dirty_effects);
    }
  }
  capture(source2, value, is_derived = false) {
    if (source2.v !== UNINITIALIZED && !this.previous.has(source2)) {
      this.previous.set(source2, source2.v);
    }
    if ((source2.f & ERROR_VALUE) === 0) {
      this.current.set(source2, [value, is_derived]);
      batch_values?.set(source2, value);
    }
    if (!this.is_fork) {
      source2.v = value;
    }
  }
  activate() {
    current_batch = this;
  }
  deactivate() {
    current_batch = null;
    batch_values = null;
  }
  flush() {
    try {
      if (true_default) {
        source_stacks.clear();
      }
      is_processing = true;
      current_batch = this;
      this.#process();
    } finally {
      flush_count = 0;
      last_scheduled_effect = null;
      collected_effects = null;
      legacy_updates = null;
      is_processing = false;
      current_batch = null;
      batch_values = null;
      old_values.clear();
      if (true_default) {
        for (const source2 of source_stacks) {
          source2.updated = null;
        }
      }
    }
  }
  discard() {
    for (const fn of this.#discard_callbacks)
      fn(this);
    this.#discard_callbacks.clear();
    for (const deferred2 of this.async_deriveds.values()) {
      deferred2.reject(OBSOLETE);
    }
    this.#unlink();
    this.#deferred?.resolve();
  }
  register_created_effect(effect) {
    this.#new_effects.push(effect);
  }
  #commit() {
    for (let batch = first_batch;batch !== null; batch = batch.#next) {
      var is_earlier = batch.id < this.id;
      var sources = [];
      for (const [source3, [value, is_derived]] of this.current) {
        if (batch.current.has(source3)) {
          var batch_value = batch.current.get(source3)[0];
          if (is_earlier && value !== batch_value) {
            batch.current.set(source3, [value, is_derived]);
          } else {
            continue;
          }
        }
        sources.push(source3);
      }
      if (is_earlier) {
        for (const [effect, deferred2] of this.async_deriveds) {
          const d = batch.async_deriveds.get(effect);
          if (d)
            deferred2.promise.then(d.resolve).catch(d.reject);
        }
      }
      var current = [...batch.current.keys()].filter((source3) => !batch.current.get(source3)[1]);
      if (!batch.#started || current.length === 0)
        continue;
      var others = current.filter((source3) => !this.current.has(source3));
      if (others.length === 0) {
        if (is_earlier) {
          batch.discard();
        }
      } else if (sources.length > 0) {
        if (true_default && !batch.#decrement_queued) {
          invariant(batch.#roots.length === 0, "Batch has scheduled roots");
        }
        if (is_earlier) {
          for (const unskipped of this.#unskipped_branches) {
            batch.unskip_effect(unskipped, (e) => {
              if ((e.f & (BLOCK_EFFECT | ASYNC)) !== 0) {
                batch.schedule(e);
              } else {
                batch.#defer_effects([e]);
              }
            });
          }
        }
        batch.activate();
        var marked = new Set;
        var checked = new Map;
        for (var source2 of sources) {
          mark_effects(source2, others, marked, checked);
        }
        checked = new Map;
        var current_unequal = [...batch.current].filter(([c, v1]) => {
          const v2 = this.current.get(c);
          if (!v2)
            return true;
          return v2[0] !== v1[0] || v2[1] !== v1[1];
        }).map(([c]) => c);
        if (current_unequal.length > 0) {
          for (const effect of this.#new_effects) {
            if ((effect.f & (DESTROYED | INERT | EAGER_EFFECT)) === 0 && depends_on(effect, current_unequal, checked)) {
              if ((effect.f & (ASYNC | BLOCK_EFFECT)) !== 0) {
                set_signal_status(effect, DIRTY);
                batch.schedule(effect);
              } else {
                batch.#dirty_effects.add(effect);
              }
            }
          }
        }
        if (batch.#roots.length > 0 && !batch.#decrement_queued) {
          batch.apply();
          for (var root of batch.#roots) {
            batch.#traverse(root, [], []);
          }
          batch.#roots = [];
        }
        batch.deactivate();
      }
    }
  }
  increment(blocking, effect) {
    this.#pending += 1;
    if (blocking) {
      let blocking_pending_count = this.#blocking_pending.get(effect) ?? 0;
      this.#blocking_pending.set(effect, blocking_pending_count + 1);
    }
  }
  decrement(blocking, effect) {
    this.#pending -= 1;
    if (blocking) {
      let blocking_pending_count = this.#blocking_pending.get(effect) ?? 0;
      if (blocking_pending_count === 1) {
        this.#blocking_pending.delete(effect);
      } else {
        this.#blocking_pending.set(effect, blocking_pending_count - 1);
      }
    }
    if (this.#decrement_queued)
      return;
    this.#decrement_queued = true;
    queue_micro_task(() => {
      this.#decrement_queued = false;
      if (this.linked) {
        this.flush();
      }
    });
  }
  transfer_effects(dirty_effects, maybe_dirty_effects) {
    for (const e of dirty_effects) {
      this.#dirty_effects.add(e);
    }
    for (const e of maybe_dirty_effects) {
      this.#maybe_dirty_effects.add(e);
    }
    dirty_effects.clear();
    maybe_dirty_effects.clear();
  }
  oncommit(fn) {
    this.#commit_callbacks.add(fn);
  }
  ondiscard(fn) {
    this.#discard_callbacks.add(fn);
  }
  settled() {
    return (this.#deferred ??= deferred()).promise;
  }
  static ensure() {
    if (current_batch === null) {
      const batch = current_batch = new Batch;
      if (!is_processing && !is_flushing_sync) {
        queue_micro_task(() => {
          if (!batch.#started) {
            batch.flush();
          }
        });
      }
    }
    return current_batch;
  }
  apply() {
    if (!async_mode_flag || !this.is_fork && this.#prev === null && this.#next === null) {
      batch_values = null;
      return;
    }
    batch_values = new Map;
    for (const [source2, [value]] of this.current) {
      batch_values.set(source2, value);
    }
    for (let batch = first_batch;batch !== null; batch = batch.#next) {
      if (batch === this || batch.is_fork)
        continue;
      var intersects = false;
      if (batch.id < this.id) {
        for (const [source2, [, is_derived]] of batch.current) {
          if (is_derived)
            continue;
          if (this.current.has(source2)) {
            intersects = true;
            break;
          }
        }
      }
      if (!intersects) {
        for (const [source2, previous] of batch.previous) {
          if (!batch_values.has(source2)) {
            batch_values.set(source2, previous);
          }
        }
      }
    }
  }
  schedule(effect) {
    last_scheduled_effect = effect;
    if (effect.b?.is_pending && (effect.f & (EFFECT | RENDER_EFFECT | MANAGED_EFFECT)) !== 0 && (effect.f & REACTION_RAN) === 0) {
      effect.b.defer_effect(effect);
      return;
    }
    var e = effect;
    while (e.parent !== null) {
      e = e.parent;
      var flags2 = e.f;
      if (collected_effects !== null && e === active_effect) {
        if (async_mode_flag)
          return;
        if ((active_reaction === null || (active_reaction.f & DERIVED) === 0) && !legacy_is_updating_store) {
          return;
        }
      }
      if ((flags2 & (ROOT_EFFECT | BRANCH_EFFECT)) !== 0) {
        if ((flags2 & CLEAN) === 0) {
          return;
        }
        e.f ^= CLEAN;
      }
    }
    this.#roots.push(e);
  }
  #unlink() {
    if (!this.linked)
      return;
    var prev = this.#prev;
    var next2 = this.#next;
    if (prev === null) {
      first_batch = next2;
    } else {
      prev.#next = next2;
    }
    if (next2 === null) {
      last_batch = prev;
    } else {
      next2.#prev = prev;
    }
    this.linked = false;
  }
}
function infinite_loop_guard() {
  if (true_default) {
    var updates = new Map;
    for (const source2 of current_batch.current.keys()) {
      for (const [stack2, update2] of source2.updated ?? []) {
        var entry = updates.get(stack2);
        if (!entry) {
          entry = { error: update2.error, count: 0 };
          updates.set(stack2, entry);
        }
        entry.count += update2.count;
      }
    }
    for (const update2 of updates.values()) {
      if (update2.error) {
        console.error(update2.error);
      }
    }
  }
  try {
    effect_update_depth_exceeded();
  } catch (error) {
    if (true_default) {
      define_property(error, "stack", { value: "" });
    }
    invoke_error_boundary(error, last_scheduled_effect);
  }
}
var eager_block_effects = null;
function flush_queued_effects(effects) {
  var length = effects.length;
  if (length === 0)
    return;
  var i = 0;
  while (i < length) {
    var effect = effects[i++];
    if ((effect.f & (DESTROYED | INERT)) === 0 && is_dirty(effect)) {
      eager_block_effects = new Set;
      update_effect(effect);
      if (effect.deps === null && effect.first === null && effect.nodes === null && effect.teardown === null && effect.ac === null) {
        unlink_effect(effect);
      }
      if (eager_block_effects?.size > 0) {
        old_values.clear();
        for (const e of eager_block_effects) {
          if ((e.f & (DESTROYED | INERT)) !== 0)
            continue;
          const ordered_effects = [e];
          let ancestor = e.parent;
          while (ancestor !== null) {
            if (eager_block_effects.has(ancestor)) {
              eager_block_effects.delete(ancestor);
              ordered_effects.push(ancestor);
            }
            ancestor = ancestor.parent;
          }
          for (let j = ordered_effects.length - 1;j >= 0; j--) {
            const e2 = ordered_effects[j];
            if ((e2.f & (DESTROYED | INERT)) !== 0)
              continue;
            update_effect(e2);
          }
        }
        eager_block_effects.clear();
      }
    }
  }
  eager_block_effects = null;
}
function mark_effects(value, sources, marked, checked) {
  if (marked.has(value))
    return;
  marked.add(value);
  if (value.reactions !== null) {
    for (const reaction of value.reactions) {
      const flags2 = reaction.f;
      if ((flags2 & DERIVED) !== 0) {
        mark_effects(reaction, sources, marked, checked);
      } else if ((flags2 & (ASYNC | BLOCK_EFFECT)) !== 0 && (flags2 & DIRTY) === 0 && depends_on(reaction, sources, checked)) {
        set_signal_status(reaction, DIRTY);
        schedule_effect(reaction);
      }
    }
  }
}
function depends_on(reaction, sources, checked) {
  const depends = checked.get(reaction);
  if (depends !== undefined)
    return depends;
  if (reaction.deps !== null) {
    for (const dep of reaction.deps) {
      if (includes.call(sources, dep)) {
        return true;
      }
      if ((dep.f & DERIVED) !== 0 && depends_on(dep, sources, checked)) {
        checked.set(dep, true);
        return true;
      }
    }
  }
  checked.set(reaction, false);
  return false;
}
function schedule_effect(effect) {
  current_batch.schedule(effect);
}
var version_map = new Map;
function reset_branch(effect, tracked) {
  if ((effect.f & BRANCH_EFFECT) !== 0 && (effect.f & CLEAN) !== 0) {
    return;
  }
  if ((effect.f & DIRTY) !== 0) {
    tracked.d.push(effect);
  } else if ((effect.f & MAYBE_DIRTY) !== 0) {
    tracked.m.push(effect);
  }
  set_signal_status(effect, CLEAN);
  var e = effect.first;
  while (e !== null) {
    reset_branch(e, tracked);
    e = e.next;
  }
}
function reset_all(effect) {
  set_signal_status(effect, CLEAN);
  var e = effect.first;
  while (e !== null) {
    reset_all(e);
    e = e.next;
  }
}

// node_modules/svelte/src/internal/client/reactivity/sources.js
var eager_effects = new Set;
var old_values = new Map;
function set_eager_effects(v) {
  eager_effects = v;
}
var eager_effects_deferred = false;
function set_eager_effects_deferred() {
  eager_effects_deferred = true;
}
function source(v, stack2) {
  var signal = {
    f: 0,
    v,
    reactions: null,
    equals,
    rv: 0,
    wv: 0
  };
  if (true_default && tracing_mode_flag) {
    signal.created = stack2 ?? get_error("created at");
    signal.updated = null;
    signal.set_during_effect = false;
    signal.trace = null;
  }
  return signal;
}
function state(v, stack2) {
  const s = source(v, stack2);
  push_reaction_value(s);
  return s;
}
function set(source2, value, should_proxy = false) {
  if (active_reaction !== null && (!untracking || (active_reaction.f & EAGER_EFFECT) !== 0) && is_runes() && (active_reaction.f & (DERIVED | BLOCK_EFFECT | ASYNC | EAGER_EFFECT)) !== 0 && (current_sources === null || !current_sources.has(source2))) {
    state_unsafe_mutation();
  }
  let new_value = should_proxy ? proxy(value) : value;
  if (true_default) {
    tag_proxy(new_value, source2.label);
  }
  return internal_set(source2, new_value, legacy_updates);
}
function internal_set(source2, value, updated_during_traversal = null) {
  if (!source2.equals(value)) {
    if (is_destroying_effect) {
      old_values.set(source2, value);
    } else if (!old_values.has(source2)) {
      old_values.set(source2, source2.v);
    }
    var batch = Batch.ensure();
    batch.capture(source2, value);
    if (true_default) {
      if (tracing_mode_flag || active_effect !== null) {
        source2.updated ??= new Map;
        const count = (source2.updated.get("")?.count ?? 0) + 1;
        source2.updated.set("", { error: null, count });
        if (tracing_mode_flag || count > 5) {
          const error = get_error("updated at");
          if (error !== null) {
            let entry = source2.updated.get(error.stack);
            if (!entry) {
              entry = { error, count: 0 };
              source2.updated.set(error.stack, entry);
            }
            entry.count++;
          }
        }
      }
      if (active_effect !== null) {
        source2.set_during_effect = true;
      }
    }
    if ((source2.f & DERIVED) !== 0) {
      const derived3 = source2;
      if ((source2.f & DIRTY) !== 0) {
        execute_derived(derived3);
      }
      if (batch_values === null) {
        update_derived_status(derived3);
      }
    }
    source2.wv = increment_write_version();
    mark_reactions(source2, DIRTY, updated_during_traversal);
    if (is_runes() && active_effect !== null && (active_effect.f & CLEAN) !== 0 && (active_effect.f & (BRANCH_EFFECT | ROOT_EFFECT)) === 0) {
      if (untracked_writes === null) {
        set_untracked_writes([source2]);
      } else {
        untracked_writes.push(source2);
      }
    }
    if (!batch.is_fork && eager_effects.size > 0 && !eager_effects_deferred) {
      flush_eager_effects();
    }
  }
  return value;
}
function flush_eager_effects() {
  eager_effects_deferred = false;
  for (const effect of eager_effects) {
    if ((effect.f & CLEAN) !== 0) {
      set_signal_status(effect, MAYBE_DIRTY);
    }
    let dirty;
    try {
      dirty = is_dirty(effect);
    } catch {
      dirty = true;
    }
    if (dirty) {
      update_effect(effect);
    }
  }
  eager_effects.clear();
}
function increment(source2) {
  set(source2, source2.v + 1);
}
function mark_reactions(signal, status, updated_during_traversal) {
  var reactions = signal.reactions;
  if (reactions === null)
    return;
  var runes = is_runes();
  var length = reactions.length;
  for (var i = 0;i < length; i++) {
    var reaction = reactions[i];
    var flags2 = reaction.f;
    if (!runes && reaction === active_effect)
      continue;
    var not_dirty = (flags2 & DIRTY) === 0;
    if (not_dirty) {
      set_signal_status(reaction, status);
    }
    if ((flags2 & EAGER_EFFECT) !== 0) {
      eager_effects.add(reaction);
    } else if ((flags2 & DERIVED) !== 0) {
      var derived3 = reaction;
      batch_values?.delete(derived3);
      if ((flags2 & WAS_MARKED) === 0) {
        if (flags2 & CONNECTED && (active_effect === null || (active_effect.f & REACTION_IS_UPDATING) === 0)) {
          reaction.f |= WAS_MARKED;
        }
        mark_reactions(derived3, MAYBE_DIRTY, updated_during_traversal);
      }
    } else if (not_dirty) {
      var effect = reaction;
      if ((flags2 & BLOCK_EFFECT) !== 0 && eager_block_effects !== null) {
        eager_block_effects.add(effect);
      }
      if (updated_during_traversal !== null) {
        updated_during_traversal.push(effect);
      } else {
        schedule_effect(effect);
      }
    }
  }
}

// node_modules/svelte/src/internal/client/legacy.js
var captured_signals = null;

// node_modules/svelte/src/internal/client/runtime.js
var is_updating_effect = false;
var is_destroying_effect = false;
function set_is_destroying_effect(value) {
  is_destroying_effect = value;
}
var active_reaction = null;
var untracking = false;
function set_active_reaction(reaction) {
  active_reaction = reaction;
}
var active_effect = null;
function set_active_effect(effect) {
  active_effect = effect;
}
var current_sources = null;
function push_reaction_value(value) {
  if (active_reaction !== null && (!async_mode_flag || (active_reaction.f & DERIVED) !== 0)) {
    (current_sources ??= new Set).add(value);
  }
}
var new_deps = null;
var skipped_deps = 0;
var untracked_writes = null;
function set_untracked_writes(value) {
  untracked_writes = value;
}
var write_version = 1;
var read_version = 0;
var update_version = read_version;
function set_update_version(value) {
  update_version = value;
}
function increment_write_version() {
  return ++write_version;
}
function is_dirty(reaction) {
  var flags2 = reaction.f;
  if ((flags2 & DIRTY) !== 0) {
    return true;
  }
  if (flags2 & DERIVED) {
    reaction.f &= ~WAS_MARKED;
  }
  if ((flags2 & MAYBE_DIRTY) !== 0) {
    var dependencies = reaction.deps;
    var length = dependencies.length;
    for (var i = 0;i < length; i++) {
      var dependency = dependencies[i];
      if (is_dirty(dependency)) {
        update_derived(dependency);
      }
      if (dependency.wv > reaction.wv) {
        return true;
      }
    }
    if ((flags2 & CONNECTED) !== 0 && batch_values === null) {
      set_signal_status(reaction, CLEAN);
    }
  }
  return false;
}
function schedule_possible_effect_self_invalidation(signal, effect, root = true) {
  var reactions = signal.reactions;
  if (reactions === null)
    return;
  if (!async_mode_flag && current_sources !== null && current_sources.has(signal)) {
    return;
  }
  for (var i = 0;i < reactions.length; i++) {
    var reaction = reactions[i];
    if ((reaction.f & DERIVED) !== 0) {
      schedule_possible_effect_self_invalidation(reaction, effect, false);
    } else if (effect === reaction) {
      if (root) {
        set_signal_status(reaction, DIRTY);
      } else if ((reaction.f & CLEAN) !== 0) {
        set_signal_status(reaction, MAYBE_DIRTY);
      }
      schedule_effect(reaction);
    }
  }
}
function update_reaction(reaction) {
  var previous_deps = new_deps;
  var previous_skipped_deps = skipped_deps;
  var previous_untracked_writes = untracked_writes;
  var previous_reaction = active_reaction;
  var previous_sources = current_sources;
  var previous_component_context = component_context;
  var previous_untracking = untracking;
  var previous_update_version = update_version;
  var flags2 = reaction.f;
  new_deps = null;
  skipped_deps = 0;
  untracked_writes = null;
  active_reaction = (flags2 & (BRANCH_EFFECT | ROOT_EFFECT)) === 0 ? reaction : null;
  current_sources = null;
  set_component_context(reaction.ctx);
  untracking = false;
  update_version = ++read_version;
  if (reaction.ac !== null) {
    without_reactive_context(() => {
      reaction.ac.abort(STALE_REACTION);
    });
    reaction.ac = null;
  }
  try {
    reaction.f |= REACTION_IS_UPDATING;
    var fn = reaction.fn;
    var result = fn();
    reaction.f |= REACTION_RAN;
    var deps = reaction.deps;
    var is_fork = current_batch?.is_fork;
    if (new_deps !== null) {
      var i;
      if (!is_fork) {
        remove_reactions(reaction, skipped_deps);
      }
      if (deps !== null && skipped_deps > 0) {
        deps.length = skipped_deps + new_deps.length;
        for (i = 0;i < new_deps.length; i++) {
          deps[skipped_deps + i] = new_deps[i];
        }
      } else {
        reaction.deps = deps = new_deps;
      }
      if (effect_tracking() && (reaction.f & CONNECTED) !== 0) {
        for (i = skipped_deps;i < deps.length; i++) {
          (deps[i].reactions ??= []).push(reaction);
        }
      }
    } else if (!is_fork && deps !== null && skipped_deps < deps.length) {
      remove_reactions(reaction, skipped_deps);
      deps.length = skipped_deps;
    }
    if (is_runes() && untracked_writes !== null && !untracking && deps !== null && (reaction.f & (DERIVED | MAYBE_DIRTY | DIRTY)) === 0) {
      for (i = 0;i < untracked_writes.length; i++) {
        schedule_possible_effect_self_invalidation(untracked_writes[i], reaction);
      }
    }
    if (previous_reaction !== null && previous_reaction !== reaction) {
      read_version++;
      if (previous_reaction.deps !== null) {
        for (let i2 = 0;i2 < previous_skipped_deps; i2 += 1) {
          previous_reaction.deps[i2].rv = read_version;
        }
      }
      if (previous_deps !== null) {
        for (const dep of previous_deps) {
          dep.rv = read_version;
        }
      }
      if (untracked_writes !== null) {
        if (previous_untracked_writes === null) {
          previous_untracked_writes = untracked_writes;
        } else {
          previous_untracked_writes.push(...untracked_writes);
        }
      }
    }
    if ((reaction.f & ERROR_VALUE) !== 0) {
      reaction.f ^= ERROR_VALUE;
    }
    return result;
  } catch (error) {
    return handle_error(error);
  } finally {
    reaction.f ^= REACTION_IS_UPDATING;
    new_deps = previous_deps;
    skipped_deps = previous_skipped_deps;
    untracked_writes = previous_untracked_writes;
    active_reaction = previous_reaction;
    current_sources = previous_sources;
    set_component_context(previous_component_context);
    untracking = previous_untracking;
    update_version = previous_update_version;
  }
}
function remove_reaction(signal, dependency) {
  let reactions = dependency.reactions;
  if (reactions !== null) {
    var index = index_of.call(reactions, signal);
    if (index !== -1) {
      var new_length = reactions.length - 1;
      if (new_length === 0) {
        reactions = dependency.reactions = null;
      } else {
        reactions[index] = reactions[new_length];
        reactions.pop();
      }
    }
  }
  if (reactions === null && (dependency.f & DERIVED) !== 0 && (new_deps === null || !includes.call(new_deps, dependency))) {
    var derived3 = dependency;
    if ((derived3.f & CONNECTED) !== 0) {
      derived3.f ^= CONNECTED;
      derived3.f &= ~WAS_MARKED;
    }
    if (derived3.v !== UNINITIALIZED) {
      update_derived_status(derived3);
    }
    if (derived3.ac !== null) {
      without_reactive_context(() => {
        derived3.ac.abort(STALE_REACTION);
        derived3.ac = null;
        set_signal_status(derived3, DIRTY);
      });
    }
    freeze_derived_effects(derived3);
    remove_reactions(derived3, 0);
  }
}
function remove_reactions(signal, start_index) {
  var dependencies = signal.deps;
  if (dependencies === null)
    return;
  for (var i = start_index;i < dependencies.length; i++) {
    remove_reaction(signal, dependencies[i]);
  }
}
function update_effect(effect) {
  var flags2 = effect.f;
  if ((flags2 & DESTROYED) !== 0) {
    return;
  }
  set_signal_status(effect, CLEAN);
  var previous_effect = active_effect;
  var was_updating_effect = is_updating_effect;
  active_effect = effect;
  is_updating_effect = (flags2 & (BRANCH_EFFECT | ROOT_EFFECT)) === 0;
  if (true_default) {
    var previous_component_fn = dev_current_component_function;
    set_dev_current_component_function(effect.component_function);
    var previous_stack = dev_stack;
    set_dev_stack(effect.dev_stack ?? dev_stack);
  }
  try {
    if ((flags2 & (BLOCK_EFFECT | MANAGED_EFFECT)) !== 0) {
      destroy_block_effect_children(effect);
    } else {
      destroy_effect_children(effect);
    }
    execute_effect_teardown(effect);
    var teardown2 = update_reaction(effect);
    effect.teardown = typeof teardown2 === "function" ? teardown2 : null;
    effect.wv = write_version;
    if (true_default && tracing_mode_flag && (effect.f & DIRTY) !== 0 && effect.deps !== null) {
      for (var dep of effect.deps) {
        if (dep.set_during_effect) {
          dep.wv = increment_write_version();
          dep.set_during_effect = false;
        }
      }
    }
  } finally {
    is_updating_effect = was_updating_effect;
    active_effect = previous_effect;
    if (true_default) {
      set_dev_current_component_function(previous_component_fn);
      set_dev_stack(previous_stack);
    }
  }
}
function get(signal) {
  var flags2 = signal.f;
  var is_derived = (flags2 & DERIVED) !== 0;
  captured_signals?.add(signal);
  if (active_reaction !== null && !untracking) {
    var destroyed = active_effect !== null && (active_effect.f & DESTROYED) !== 0;
    if (!destroyed && (current_sources === null || !current_sources.has(signal))) {
      var deps = active_reaction.deps;
      if ((active_reaction.f & REACTION_IS_UPDATING) !== 0) {
        if (signal.rv < read_version) {
          signal.rv = read_version;
          if (new_deps === null && deps !== null && deps[skipped_deps] === signal) {
            skipped_deps++;
          } else if (new_deps === null) {
            new_deps = [signal];
          } else {
            new_deps.push(signal);
          }
        }
      } else {
        active_reaction.deps ??= [];
        if (!includes.call(active_reaction.deps, signal)) {
          active_reaction.deps.push(signal);
        }
        var reactions = signal.reactions;
        if (reactions === null) {
          signal.reactions = [active_reaction];
        } else if (!includes.call(reactions, active_reaction)) {
          reactions.push(active_reaction);
        }
      }
    }
  }
  if (true_default) {
    if (!untracking && reactivity_loss_tracker && current_batch === null && previous_batch === null && !reactivity_loss_tracker.warned && (reactivity_loss_tracker.effect.f & REACTION_IS_UPDATING) === 0 && !reactivity_loss_tracker.effect_deps.has(signal)) {
      reactivity_loss_tracker.warned = true;
      await_reactivity_loss(signal.label);
      var trace = get_error("traced at");
      if (trace)
        console.warn(trace);
    }
    recent_async_deriveds.delete(signal);
    if (tracing_mode_flag && !untracking && tracing_expressions !== null && active_reaction !== null && tracing_expressions.reaction === active_reaction) {
      if (signal.trace) {
        signal.trace();
      } else {
        trace = get_error("traced at");
        if (trace) {
          var entry = tracing_expressions.entries.get(signal);
          if (entry === undefined) {
            entry = { traces: [] };
            tracing_expressions.entries.set(signal, entry);
          }
          var last = entry.traces[entry.traces.length - 1];
          if (trace.stack !== last?.stack) {
            entry.traces.push(trace);
          }
        }
      }
    }
  }
  if (is_destroying_effect && old_values.has(signal)) {
    return old_values.get(signal);
  }
  if (is_derived) {
    var derived3 = signal;
    if (is_destroying_effect) {
      var value = derived3.v;
      if ((derived3.f & CLEAN) === 0 && derived3.reactions !== null || depends_on_old_values(derived3)) {
        value = execute_derived(derived3);
      }
      old_values.set(derived3, value);
      return value;
    }
    var should_connect = (derived3.f & CONNECTED) === 0 && !untracking && active_reaction !== null && (is_updating_effect || (active_reaction.f & CONNECTED) !== 0);
    var is_new = (derived3.f & REACTION_RAN) === 0;
    if (is_dirty(derived3)) {
      if (should_connect) {
        derived3.f |= CONNECTED;
      }
      update_derived(derived3);
    }
    if (should_connect && !is_new) {
      unfreeze_derived_effects(derived3);
      reconnect(derived3);
    }
  }
  if (batch_values?.has(signal)) {
    return batch_values.get(signal);
  }
  if ((signal.f & ERROR_VALUE) !== 0) {
    throw signal.v;
  }
  return signal.v;
}
function reconnect(derived3) {
  derived3.f |= CONNECTED;
  if (derived3.deps === null)
    return;
  for (const dep of derived3.deps) {
    (dep.reactions ??= []).push(derived3);
    if ((dep.f & DERIVED) !== 0 && (dep.f & CONNECTED) === 0) {
      unfreeze_derived_effects(dep);
      reconnect(dep);
    }
  }
}
function depends_on_old_values(derived3) {
  if (derived3.v === UNINITIALIZED)
    return true;
  if (derived3.deps === null)
    return false;
  for (const dep of derived3.deps) {
    if (old_values.has(dep)) {
      return true;
    }
    if ((dep.f & DERIVED) !== 0 && depends_on_old_values(dep)) {
      return true;
    }
  }
  return false;
}
function untrack(fn) {
  var previous_untracking = untracking;
  try {
    untracking = true;
    return fn();
  } finally {
    untracking = previous_untracking;
  }
}

// node_modules/svelte/src/internal/client/reactivity/effects.js
function push_effect(effect, parent_effect) {
  var parent_last = parent_effect.last;
  if (parent_last === null) {
    parent_effect.last = parent_effect.first = effect;
  } else {
    parent_last.next = effect;
    effect.prev = parent_last;
    parent_effect.last = effect;
  }
}
function create_effect(type, fn) {
  var parent = active_effect;
  if (true_default) {
    while (parent !== null && (parent.f & EAGER_EFFECT) !== 0) {
      parent = parent.parent;
    }
  }
  if (parent !== null && (parent.f & INERT) !== 0) {
    type |= INERT;
  }
  var effect = {
    ctx: component_context,
    deps: null,
    nodes: null,
    f: type | DIRTY | CONNECTED,
    first: null,
    fn,
    last: null,
    next: null,
    parent,
    b: parent && parent.b,
    prev: null,
    teardown: null,
    wv: 0,
    ac: null
  };
  if (true_default) {
    effect.component_function = dev_current_component_function;
  }
  current_batch?.register_created_effect(effect);
  var e = effect;
  if ((type & EFFECT) !== 0) {
    if (collected_effects !== null) {
      collected_effects.push(effect);
    } else {
      Batch.ensure().schedule(effect);
    }
  } else if (fn !== null) {
    try {
      update_effect(effect);
    } catch (e2) {
      destroy_effect(effect);
      throw e2;
    }
    if (e.deps === null && e.teardown === null && e.nodes === null && e.first === e.last && (e.f & EFFECT_PRESERVED) === 0) {
      e = e.first;
      if ((type & BLOCK_EFFECT) !== 0 && (type & EFFECT_TRANSPARENT) !== 0 && e !== null) {
        e.f |= EFFECT_TRANSPARENT;
      }
    }
  }
  if (e !== null) {
    e.parent = parent;
    if (parent !== null) {
      push_effect(e, parent);
    }
    if (active_reaction !== null && (active_reaction.f & DERIVED) !== 0 && (type & ROOT_EFFECT) === 0) {
      var derived3 = active_reaction;
      (derived3.effects ??= []).push(e);
    }
  }
  return effect;
}
function effect_tracking() {
  return active_reaction !== null && !untracking;
}
function effect_root(fn) {
  Batch.ensure();
  const effect = create_effect(ROOT_EFFECT | EFFECT_PRESERVED, fn);
  return () => {
    destroy_effect(effect);
  };
}
function render_effect(fn, flags2 = 0) {
  return create_effect(RENDER_EFFECT | flags2, fn);
}
function block(fn, flags2 = 0) {
  var effect = create_effect(BLOCK_EFFECT | flags2, fn);
  if (true_default) {
    effect.dev_stack = dev_stack;
  }
  return effect;
}
function branch(fn) {
  return create_effect(BRANCH_EFFECT | EFFECT_PRESERVED, fn);
}
function execute_effect_teardown(effect) {
  var teardown2 = effect.teardown;
  if (teardown2 !== null) {
    const previously_destroying_effect = is_destroying_effect;
    const previous_reaction = active_reaction;
    set_is_destroying_effect(true);
    set_active_reaction(null);
    try {
      teardown2.call(null);
    } finally {
      set_is_destroying_effect(previously_destroying_effect);
      set_active_reaction(previous_reaction);
    }
  }
}
function destroy_effect_children(signal, remove_dom = false) {
  var effect = signal.first;
  signal.first = signal.last = null;
  while (effect !== null) {
    const controller = effect.ac;
    if (controller !== null) {
      without_reactive_context(() => {
        controller.abort(STALE_REACTION);
      });
    }
    var next2 = effect.next;
    if ((effect.f & ROOT_EFFECT) !== 0) {
      effect.parent = null;
    } else {
      destroy_effect(effect, remove_dom);
    }
    effect = next2;
  }
}
function destroy_block_effect_children(signal) {
  var effect = signal.first;
  while (effect !== null) {
    var next2 = effect.next;
    if ((effect.f & BRANCH_EFFECT) === 0) {
      destroy_effect(effect);
    }
    effect = next2;
  }
}
function destroy_effect(effect, remove_dom = true) {
  var removed = false;
  if ((remove_dom || (effect.f & HEAD_EFFECT) !== 0) && effect.nodes !== null && effect.nodes.end !== null) {
    remove_effect_dom(effect.nodes.start, effect.nodes.end);
    removed = true;
  }
  effect.f |= DESTROYING;
  destroy_effect_children(effect, remove_dom && !removed);
  remove_reactions(effect, 0);
  var transitions = effect.nodes && effect.nodes.t;
  if (transitions !== null) {
    for (const transition of transitions) {
      transition.stop();
    }
  }
  execute_effect_teardown(effect);
  effect.f ^= DESTROYING;
  effect.f |= DESTROYED;
  var parent = effect.parent;
  if (parent !== null && parent.first !== null) {
    unlink_effect(effect);
  }
  if (true_default) {
    effect.component_function = null;
  }
  effect.next = effect.prev = effect.teardown = effect.ctx = effect.deps = effect.fn = effect.nodes = effect.ac = effect.b = null;
}
function remove_effect_dom(node, end) {
  while (node !== null) {
    var next2 = node === end ? null : get_next_sibling(node);
    node.remove();
    node = next2;
  }
}
function unlink_effect(effect) {
  var parent = effect.parent;
  var prev = effect.prev;
  var next2 = effect.next;
  if (prev !== null)
    prev.next = next2;
  if (next2 !== null)
    next2.prev = prev;
  if (parent !== null) {
    if (parent.first === effect)
      parent.first = next2;
    if (parent.last === effect)
      parent.last = prev;
  }
}
function pause_effect(effect, callback, destroy = true) {
  var transitions = [];
  pause_children(effect, transitions, true);
  var fn = () => {
    if (destroy)
      destroy_effect(effect);
    if (callback)
      callback();
  };
  var remaining = transitions.length;
  if (remaining > 0) {
    var check = () => --remaining || fn();
    for (var transition of transitions) {
      transition.out(check);
    }
  } else {
    fn();
  }
}
function pause_children(effect, transitions, local) {
  if ((effect.f & INERT) !== 0)
    return;
  effect.f ^= INERT;
  var t = effect.nodes && effect.nodes.t;
  if (t !== null) {
    for (const transition of t) {
      if (transition.is_global || local) {
        transitions.push(transition);
      }
    }
  }
  var child = effect.first;
  while (child !== null) {
    var sibling = child.next;
    if ((child.f & ROOT_EFFECT) === 0) {
      var transparent = (child.f & EFFECT_TRANSPARENT) !== 0 || (child.f & BRANCH_EFFECT) !== 0 && (effect.f & BLOCK_EFFECT) !== 0;
      pause_children(child, transitions, transparent ? local : false);
    }
    child = sibling;
  }
}
function move_effect(effect, fragment) {
  if (!effect.nodes)
    return;
  var node = effect.nodes.start;
  var end = effect.nodes.end;
  while (node !== null) {
    var next2 = node === end ? null : get_next_sibling(node);
    fragment.append(node);
    node = next2;
  }
}

// node_modules/svelte/src/store/index-client.js
function toStore(get3, set2) {
  var effect = active_effect;
  var reaction = active_reaction;
  var init_value = get3();
  const store = writable(init_value, (set3) => {
    var ran = init_value !== get3();
    var teardown2;
    var previous_reaction = active_reaction;
    var previous_effect = active_effect;
    set_active_reaction(reaction);
    set_active_effect(effect);
    try {
      teardown2 = effect_root(() => {
        render_effect(() => {
          const value = get3();
          if (ran)
            set3(value);
        });
      });
    } finally {
      set_active_reaction(previous_reaction);
      set_active_effect(previous_effect);
    }
    ran = true;
    return teardown2;
  });
  if (set2) {
    return {
      set: set2,
      update: (fn) => set2(fn(get3())),
      subscribe: store.subscribe
    };
  }
  return {
    subscribe: store.subscribe
  };
}
function fromStore(store) {
  let value = undefined;
  const subscribe = createSubscriber((update2) => {
    let ran = false;
    const unsubscribe = store.subscribe((v) => {
      value = v;
      if (ran)
        update2();
    });
    ran = true;
    return unsubscribe;
  });
  function current() {
    if (effect_tracking()) {
      subscribe();
      return value;
    }
    return get2(store);
  }
  if ("set" in store) {
    return {
      get current() {
        return current();
      },
      set current(v) {
        store.set(v);
      }
    };
  }
  return {
    get current() {
      return current();
    }
  };
}
export {
  writable,
  toStore,
  readonly,
  readable,
  get2 as get,
  fromStore,
  derived
};
