eon.interpolation = eon.interpolation || {};
eon.interpolation.tags = ["{{", "}}", "="];

eon.interpolation.globalScope = eon.interpolation.globalScope || eon;

eon.interpolation.globalScope.data = eon.interpolation.globalScope.data || {};
eon.interpolation.globalScope.locale = eon.interpolation.globalScope.locale || {};

// Replaces all the echo/script for its corresponding elements and prepares them
eon.interpolation.prepare = function (template) {

  // Extend vimlet.meta
  if (!vimlet.meta.sandbox) {
    vimlet.meta.sandbox = {
      "bind": function (keyPath, rootPath, global) {

        global = eon.util.isTrue(global) ? true : false;

        // If rootPath is provided we split it
        rootPath = rootPath && rootPath != "" ? rootPath.split(".") : rootPath;

        // If the first element of the rootPath is either "data" or "global"
        if (rootPath && ((rootPath[0] == "data" && !global) || (rootPath[0] == "global"))) {

          // Removes the data/global from the path
          rootPath.shift();
          // Joins the remaining path
          rootPath = rootPath.join(".");

          keyPath = rootPath != "" ? rootPath + "." + keyPath : keyPath;

        }

        this.echo('<eon-variable bind="' + keyPath + '" global="' + global + '"></eon-variable>');
      }
    };
  }

  if (!vimlet.meta.shortcut) {
    vimlet.meta.shortcut = {
      "@": function (s) {

        // Transforms the string argument into our binding parameters
        var params = s.split(" ");

        var keyPath = params.length > 1 ? params[1] : params[0];
        var rootPath = params.length > 1 ? params[0] : undefined;
        var global = rootPath && rootPath.split(".")[0] == "global" ? true : false;

        keyPath = "\"" + keyPath + "\"";
        rootPath = rootPath ? "\"" + rootPath + "\"" : rootPath;
        params = "[ " + keyPath + ", " + rootPath + ", " + global + "]";

        return "bind.apply(undefined, " + params + ");";
      }
    };
  }


  vimlet.meta.tags = eon.interpolation.tags;
  vimlet.meta.parse(window, template.innerHTML, null, function (result) {
    template.innerHTML = result;
  });

  return template;
};

// Handles all the initial state of the data and variable elements
eon.interpolation.init = function (el, config) {

  var sources = {};

  sources.element = {};
  sources.global = {};
  
  // First of all checks if there is a data specified in the element config, if so, it creates the source
  if (Object.keys(el.data).length > 0) {

    sources.element.data = {};
    sources.element.data.scope = el;
    sources.element.data.obj = el.data;
    sources.element.data.isGlobal = false;
    sources.element.data.isLocale = false;

  }

  // If parse is not enabled then we will try to create onDataChanged callback if data exists on the component
  if (!config.parse) {

    if (sources.element.data) {
      
      eon.interpolation.setupDataChangeCallback(el, sources.element.data, config);
      eon.interpolation.setupDataPropDescriptors(sources.element.data, "data");

    }

  } else {

    var variables = el.template.querySelectorAll("eon-variable");
    var currentVariable;

    var isGlobal, scope, source, sourceType;
    var bindString, bindValue, root;

    eon.interpolation.globalScope.__interpolations = eon.interpolation.globalScope.__interpolations || {};
    el.__interpolations = el.__interpolations || {};

    // Loops all the inner element variables
    for (var i = 0; i < variables.length; i++) {

      currentVariable = variables[i];

      // Sets some basic variables to be used later on
      isGlobal = eon.util.isTrue(currentVariable.getAttribute("global"));
      bindString = currentVariable.getAttribute("bind");
      scope = isGlobal ? eon.interpolation.globalScope : el;
      sourceName = bindString.split(".")[0] == "locale" ? "locale" : "data";

      root = sourceName != "locale" ? scope[sourceName] : scope;

      // Reads if there is already a value on the source if there is not then it assigns an empty string
      bindValue = eon.object.readFromPath(root, bindString);
      bindValue = typeof bindValue == "undefined" ? "" : bindValue;

      // Reassigns the value to the source, in case there was no value
      eon.object.assignToPath(root, bindString, bindValue);

      sourceType = isGlobal ? "global" : "element";

      // Creates the source object
      if (!sources[sourceType][sourceName]) {

        sources[sourceType][sourceName] = {};
        sources[sourceType][sourceName].scope = scope;
        sources[sourceType][sourceName].obj = scope[sourceName];
        sources[sourceType][sourceName].isGlobal = isGlobal;

        sources[sourceType][sourceName].isLocale = (sourceName == "locale");

      }

    }

    var sourceTypeKeys = Object.keys(sources);
    var sourceKeys;

    for (var i = 0; i < sourceTypeKeys.length; i++) {

      sourceKeys = Object.keys(sources[sourceTypeKeys[i]]);

      for (var j = 0; j < sourceKeys.length; j++) {

        source = sources[sourceTypeKeys[i]][sourceKeys[j]];

        eon.interpolation.setupDataChangeCallback(el, source, config);
        eon.interpolation.setupDataPropDescriptors(source, sourceKeys[j]);
        eon.interpolation.interpolate(el, source, source.obj, source.scope.__interpolations);

      }

    }

  }

};

// Creates the descriptor for the data object itself and for all its properties
// eon.interpolation.setupDataPropDescriptors = function (el, config) {
eon.interpolation.setupDataPropDescriptors = function (source, sourceName) {

  var scope = source.scope;

  // Defines its own descriptor, in case the whole "data" object changes
  Object.defineProperty(
    scope,
    sourceName,
    eon.interpolation.createPropDescriptor(scope, scope, sourceName, "", scope[sourceName])
  );

  // Loops through all the keys of the object
  eon.interpolation.createObjectPropDescriptors(scope, scope[sourceName], sourceName);
}

// Simple property descriptor creation that in case its changed it will trigger our internal callback
eon.interpolation.createPropDescriptor = function (scope, keyOwnerObj, key, keyPath, value) {
  var propDescriptor = {};

  // Update property value
  keyOwnerObj["__" + key] = value;

  // Redirect get and set to __key
  propDescriptor.get = function () {
    return keyOwnerObj["__" + key];
  };

  propDescriptor.set = function (value) {
    // Trigger onDataChanged
    eon.triggerCallback("_onDataChanged", scope, scope, [keyPath + key, keyOwnerObj["__" + key], value]);

    // Update property value
    keyOwnerObj["__" + key] = value;
  };

  return propDescriptor;
}

// When the property we want to observer is an object we create its descriptor and ones for its properties
eon.interpolation.createObjectPropDescriptors = function (el, obj, keyPath) {
  var value;

  keyPath = keyPath + ".";

  for (var key in obj) {
    // We only want take into account the keys that are not used for the descriptor
    if (key.indexOf("__") == -1) {
      value = obj[key];

      obj["__" + key] = value;

      Object.defineProperty(
        obj,
        key,
        eon.interpolation.createPropDescriptor(el, obj, key, keyPath, value)
      );

      // If the value is an Object then we update the keyPath and create the propDescriptors
      if (value && value.constructor === Object) {
        keyPath = keyPath + key;
        eon.interpolation.createObjectPropDescriptors(el, value, keyPath);
      }
    }
  }
}

// Creates the private onDataChanged callback to handle the public one
eon.interpolation.setupDataChangeCallback = function (el, source, config) {
  var scope = source.scope;

  // If the private callback doesnt exist creates it
  if (!scope._onDataChanged) {

    eon.createCallback("_onDataChanged", scope);

    // When any data changes (incluiding data itself), we manage the onDataChanged triggers depending on the situation
    scope._onDataChanged(function (keyPath, oldVal, newVal) {
      
      if (newVal.constructor === Object) {
        eon.interpolation.handleObjectChange(el, scope, keyPath, oldVal, newVal, config);
      } else {
        eon.interpolation.handleVariableChange(el, scope, keyPath, oldVal, newVal, config);
      }

    });

  }

}

// Takes all the properties from data, finds its variable and sets its value
eon.interpolation.interpolate = function (el, source, obj, interpolations, bind) {
  var key, i, variableBind, variable;

  for (key in obj) {
    // We only want take into account the keys that are not used for the descriptor
    if (key.indexOf("__") == -1) {
      // If the property is an object the call ourselfs again to loop through our keys
      if (obj[key] && obj[key].constructor === Object) {

        bind = bind ? bind + "." + key : key;
        interpolations[key] = interpolations[key] ? interpolations[key] : {};

        eon.interpolation.interpolate(el, source, obj[key], interpolations[key], bind);

      } else {

        variableBind = bind ? bind + "." + key : key;
        variableBind = source.isLocale ? "locale." + variableBind : variableBind;

        interpolations[key] = interpolations[key] ? interpolations[key] : [];

        // Looks for the variables matching the binding
        Array.prototype.push.apply(interpolations[key], el.template.querySelectorAll(
          'eon-variable[bind="' + variableBind + '"][global="' + source.isGlobal + '"]'
        ));

        // For each variable found previously sets its value
        for (i = 0; i < interpolations[key].length; i++) {
          variable = interpolations[key][i];
          variable.textContent = obj[key];
        }

      }
    }
  }
}

// Handles the situation when a whole object has been changed
eon.interpolation.handleObjectChange = function (el, scope, keyPath, oldData, newData, config) {
  var checked = {};

  eon.triggerAllCallbackEvents(el, config, "onDataChanged", [keyPath, oldData, newData]);

  // Checks differences between the old and the new data
  checked = eon.interpolation.backwardDataDiffing(el, scope, keyPath, oldData, newData, checked, config);

  // Checks differences between the new and the old data, escaping the already checked ones
  eon.interpolation.forwardDataDiffing(el, scope, keyPath, newData, checked, config);
  eon.interpolation.createObjectPropDescriptors(scope, newData, keyPath, config);
}

// Handles the value change of the variable element and triggers onDataChanged
eon.interpolation.handleVariableChange = function (el, scope, keyPath, oldVal, newVal, config) {
  var pathArray = keyPath.split(".");
  var interpolationPath;
  var variablesToChange;

  // Removes the first index of the pathArray, that corresponds to "data", which we dont need for the interpolations
  pathArray.shift();
  // Sets the path back together withouth data
  interpolationPath = pathArray.join(".");
  // Takes the variable elements for the path
  variablesToChange = eon.object.readFromPath(scope.__interpolations, interpolationPath);

  // If it has variable elements changes its value 
  if (variablesToChange) {
    for (var i = 0; i < variablesToChange.length; i++) {
      variablesToChange[i].textContent = newVal;
    }
  }

  eon.triggerAllCallbackEvents(scope, config ? config : {}, "onDataChanged", [interpolationPath, oldVal, newVal]);
}

// Compares the old data with the new one and triggers the changes
eon.interpolation.backwardDataDiffing = function (el, scope, keyPath, oldData, newData, checked, config) {
  var newVal;
  // Loops through the oldData
  for (var key in oldData) {
    // We only want take into account the keys that are not used for the descriptor
    if (key.indexOf("__") == -1) {
      // If the property is an object, we enter this function again for that object
      if (oldData[key].constructor === Object) {
        checked[key] = eon.interpolation.backwardDataDiffing(el, scope, keyPath + "." + key, oldData[key], newData ? newData[key] : newData, {}, config);
      } else {
        // If there is no such property on the new Data we set it as an empty string
        newVal = newData ? newData[key] : "";
        // Handles the variable change
        eon.interpolation.handleVariableChange(el, scope, keyPath + "." + key, oldData[key], newVal, config);

        if (newData && newData.hasOwnProperty(key)) {
          checked[key] = newData[key];
        }
      }
    }
  }

  return checked;
}

// Compares the data with the already checked object
eon.interpolation.forwardDataDiffing = function (el, scope, keyPath, data, checked, config) {
  var oldVal;
  // Loops through data
  for (var key in data) {
    // We only want take into account the keys that are not used for the descriptor
    if (key.indexOf("__") == -1) {
      // If the property is an object, we enter this function again for that object
      if (data[key].constructor === Object) {
        eon.interpolation.forwardDataDiffing(el, scope, keyPath + "." + key, data[key], checked ? checked[key] : checked, config);
      } else {
        oldVal = checked ? checked[key] : "";
        // To only trigger variable change for properties that are not already checked/triggered
        if ((checked && !checked.hasOwnProperty(key)) || !checked) {
          eon.interpolation.handleVariableChange(el, scope, keyPath + "." + key, oldVal, data[key], config);
        }
      }
    }
  }
}