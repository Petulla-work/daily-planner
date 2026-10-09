/* Daily Planner — meals and workouts, stored only in localStorage. */
(function () {
  var STORAGE_KEY = "dailyPlanner.v1";
  var MEAL_TYPES = [
    ["breakfast", "Breakfast"],
    ["lunch", "Lunch"],
    ["dinner", "Dinner"],
    ["snack", "Snack"]
  ];
  var WORKOUT_CHIPS = ["Walk", "Run", "Gym", "Yoga", "Stretch"];
  var WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  var pendingDelete = null;
  var routeKey = null;
  var storageError = "";

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (key) {
        var value = attrs[key];
        if (value == null || value === false) return;
        if (key === "class") node.className = value;
        else if (key.indexOf("on") === 0 && typeof value === "function") {
          node.addEventListener(key.slice(2).toLowerCase(), value);
        } else {
          node.setAttribute(key, value === true ? "" : String(value));
        }
      });
    }
    append(node, children);
    return node;
  }

  function append(node, children) {
    if (children == null || children === false) return;
    if (Array.isArray(children)) {
      children.forEach(function (child) { append(node, child); });
      return;
    }
    node.append(children.nodeType ? children : document.createTextNode(String(children)));
  }

  function pad(n) {
    return (n < 10 ? "0" : "") + n;
  }

  function todayKey(date) {
    var d = date || new Date();
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }

  function nowTime(date) {
    var d = date || new Date();
    return pad(d.getHours()) + ":" + pad(d.getMinutes());
  }

  function isValidDate(key) {
    var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
    if (!match) return false;
    var y = +match[1];
    var m = +match[2];
    var d = +match[3];
    var dt = new Date(y, m - 1, d);
    return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
  }

  function formatDay(key) {
    var parts = key.split("-");
    var y = +parts[0];
    var m = +parts[1];
    var d = +parts[2];
    var dt = new Date(y, m - 1, d);
    var year = y !== new Date().getFullYear() ? " " + y : "";
    return WEEKDAYS[dt.getDay()] + ", " + d + " " + MONTHS[m - 1] + year;
  }

  function formatTime(at) {
    var hm = (at || "").slice(11, 16);
    var bits = hm.split(":");
    var h = +bits[0];
    var m = bits[1] || "00";
    if (isNaN(h)) return "";
    var suffix = h >= 12 ? "pm" : "am";
    var hr = h % 12 || 12;
    return hr + ":" + m + " " + suffix;
  }

  function mealLabel(type) {
    for (var i = 0; i < MEAL_TYPES.length; i++) {
      if (MEAL_TYPES[i][0] === type) return MEAL_TYPES[i][1];
    }
    return "Meal";
  }

  function defaultMealType(date) {
    var h = (date || new Date()).getHours();
    if (h < 11) return "breakfast";
    if (h < 16) return "lunch";
    if (h < 21) return "dinner";
    return "snack";
  }

  function countLine(meals, workouts) {
    var mealText = meals === 1 ? "1 meal" : meals + " meals";
    var workText = workouts === 1 ? "1 workout" : workouts + " workouts";
    return mealText + " · " + workText;
  }

  function emptyStore() {
    return { meals: [], workouts: [] };
  }

  function normalize(data) {
    var store = emptyStore();
    if (!data || typeof data !== "object") return store;
    store.meals = Array.isArray(data.meals) ? data.meals.filter(validMeal) : [];
    store.workouts = Array.isArray(data.workouts) ? data.workouts.filter(validWorkout) : [];
    return store;
  }

  function validMeal(item) {
    return item && typeof item.id === "string" && typeof item.name === "string" && typeof item.at === "string";
  }

  function validWorkout(item) {
    return item && typeof item.id === "string" && typeof item.activity === "string" && typeof item.at === "string";
  }

  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return emptyStore();
      return normalize(JSON.parse(raw));
    } catch (err) {
      storageError = "This browser is blocking saved logs, so they may not stay on this phone.";
      return emptyStore();
    }
  }

  function persist(data) {
    try {
      if (data.meals.length === 0 && data.workouts.length === 0) {
        localStorage.removeItem(STORAGE_KEY);
      } else {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      }
      storageError = "";
      return true;
    } catch (err) {
      storageError = "Couldn't save just now. Check that this browser allows site data.";
      return false;
    }
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function onDate(list, date) {
    return list.filter(function (item) {
      return (item.at || "").slice(0, 10) === date;
    }).sort(function (a, b) {
      return a.at < b.at ? -1 : a.at > b.at ? 1 : 0;
    });
  }

  function route() {
    var raw = location.hash.replace(/^#\/?/, "");
    if (raw === "" || raw === "today") return { name: "today" };
    if (raw === "meal") return { name: "meal" };
    if (raw === "workout") return { name: "workout" };
    if (raw === "history") return { name: "history" };
    var day = /^day\/(\d{4}-\d{2}-\d{2})$/.exec(raw);
    if (day && isValidDate(day[1])) return { name: "day", date: day[1] };
    return { name: "today" };
  }

  function currentKey(r) {
    return r.name === "day" ? "day:" + r.date : r.name;
  }

  function go(hash) {
    if (location.hash === hash) render();
    else location.hash = hash;
  }

  function render() {
    var r = route();
    var key = currentKey(r);
    if (key !== routeKey) {
      pendingDelete = null;
      routeKey = key;
    }
    var data = load();
    document.title = titleFor(r) + " · Daily Planner";
    document.getElementById("app").replaceChildren(build(r, data));
    var focus = document.querySelector("[data-autofocus]");
    if (focus) focus.focus();
  }

  function titleFor(r) {
    if (r.name === "meal") return "Log a meal";
    if (r.name === "workout") return "Log a workout";
    if (r.name === "history") return "History";
    if (r.name === "day") return formatDay(r.date);
    return "Today";
  }

  function build(r, data) {
    var phone = el("div", { class: "phone", "data-screen": r.name });
    phone.append(headerFor(r, data));
    phone.append(mainFor(r, data));
    if (r.name === "today") phone.append(actionBar());
    phone.append(tabBar(r));
    return phone;
  }

  function headerFor(r, data) {
    if (r.name === "meal") {
      return header({
        back: "Today",
        onBack: function () { go("#today"); },
        title: "Log a meal",
        sub: "Name it, then save."
      });
    }
    if (r.name === "workout") {
      return header({
        back: "Today",
        onBack: function () { go("#today"); },
        title: "Log a workout",
        sub: "What you did, and for how long."
      });
    }
    if (r.name === "history") {
      return header({
        kicker: true,
        title: "History",
        sub: "Earlier days, newest first."
      });
    }
    if (r.name === "day") {
      var meals = onDate(data.meals, r.date);
      var workouts = onDate(data.workouts, r.date);
      return header({
        back: "History",
        onBack: function () { go("#history"); },
        title: formatDay(r.date),
        sub: meals.length + workouts.length ? countLine(meals.length, workouts.length) : "Nothing left from this day."
      });
    }
    return header({
      kicker: true,
      title: "Today",
      sub: formatDay(todayKey())
    });
  }

  function header(opts) {
    var kids = [];
    if (opts.back) {
      kids.push(el("button", { class: "back", type: "button", onclick: opts.onBack }, "‹ " + opts.back));
    } else if (opts.kicker) {
      kids.push(el("p", { class: "kicker" }, "Daily Planner"));
    }
    kids.push(el("h1", null, opts.title));
    if (opts.sub) kids.push(el("p", { class: "sub" }, opts.sub));
    return el("header", { class: "top" }, kids);
  }

  function mainFor(r, data) {
    var main = el("main", { class: "main" });
    if (storageError) main.append(el("p", { class: "storage-note" }, storageError));
    if (r.name === "today") main.append(todayMain(data));
    else if (r.name === "meal") main.append(mealForm());
    else if (r.name === "workout") main.append(workoutForm());
    else if (r.name === "history") main.append(historyMain(data));
    else main.append(dayMain(data, r.date));
    return main;
  }

  function todayMain(data) {
    var date = todayKey();
    var wrap = el("div");
    wrap.append(section("Meals", onDate(data.meals, date), "meal", "Nothing logged yet. Add one when you eat."));
    wrap.append(section("Workouts", onDate(data.workouts, date), "workout", "Nothing logged yet. A short walk counts."));
    return wrap;
  }

  function section(title, entries, kind, emptyText) {
    var block = el("section");
    block.append(el("h2", { class: "section-label" }, title));
    if (!entries.length) {
      block.append(el("p", { class: "empty" }, emptyText));
      return block;
    }
    entries.forEach(function (entry) {
      block.append(entryCard(kind, entry));
    });
    return block;
  }

  function entryCard(kind, entry) {
    var confirming = pendingDelete && pendingDelete.kind === kind && pendingDelete.id === entry.id;
    var meta = kind === "meal"
      ? mealLabel(entry.type) + " · " + formatTime(entry.at)
      : formatTime(entry.at) + " · " + entry.minutes + " min";
    var title = kind === "meal" ? entry.name : entry.activity;
    var card = el("article", { class: "card" }, [
      el("p", { class: "meta" }, meta),
      el("p", { class: "card-title" }, title),
      entry.note ? el("p", { class: "note" }, entry.note) : null
    ]);
    if (confirming) {
      card.append(el("div", { class: "confirm" }, [
        el("p", null, "Remove this?"),
        el("button", {
          type: "button",
          class: "btn btn-quiet",
          onclick: function () {
            pendingDelete = null;
            render();
          }
        }, "Keep"),
        el("button", {
          type: "button",
          class: "btn btn-danger",
          onclick: function () { removeEntry(kind, entry.id); }
        }, "Remove")
      ]));
    } else {
      card.append(el("button", {
        type: "button",
        class: "text-btn",
        onclick: function () {
          pendingDelete = { kind: kind, id: entry.id };
          render();
        }
      }, "Remove"));
    }
    return card;
  }

  function historyMain(data) {
    var today = todayKey();
    var dates = {};
    data.meals.forEach(function (item) { mark(dates, item.at, today); });
    data.workouts.forEach(function (item) { mark(dates, item.at, today); });
    var keys = Object.keys(dates).sort().reverse();
    if (!keys.length) {
      return el("p", { class: "empty" }, "Nothing from earlier days yet. Today stays on the Today tab.");
    }
    var wrap = el("div");
    keys.forEach(function (date) {
      var meals = onDate(data.meals, date).length;
      var workouts = onDate(data.workouts, date).length;
      wrap.append(el("button", {
        type: "button",
        class: "day-link",
        onclick: function () { go("#day/" + date); }
      }, [
        el("span", { class: "day-copy" }, [
          el("strong", null, formatDay(date)),
          el("span", { class: "day-when" }, countLine(meals, workouts))
        ]),
        el("span", { class: "chevron", "aria-hidden": "true" }, "›")
      ]));
    });
    return wrap;
  }

  function mark(dates, at, today) {
    var date = (at || "").slice(0, 10);
    if (isValidDate(date) && date < today) dates[date] = true;
  }

  function dayMain(data, date) {
    return el("div", null, [
      section("Meals", onDate(data.meals, date), "meal", "No meals logged this day."),
      section("Workouts", onDate(data.workouts, date), "workout", "No workouts logged this day.")
    ]);
  }

  function mealForm() {
    var chosen = defaultMealType();
    var form = el("form", { novalidate: "novalidate", autocomplete: "off" });
    form.append(field("Meal", el("input", {
      type: "text",
      name: "mealName",
      maxlength: "80",
      placeholder: "e.g. dal and rice",
      required: "required",
      "data-autofocus": "true"
    })));

    var types = el("fieldset", { class: "type-pick" }, [
      el("legend", null, "When")
    ]);
    MEAL_TYPES.forEach(function (pair) {
      var input = el("input", { type: "radio", name: "mealType", value: pair[0] });
      if (pair[0] === chosen) input.checked = true;
      types.append(el("label", null, [input, pair[1]]));
    });
    form.append(types);

    form.append(field("Time", el("input", {
      type: "time",
      name: "mealTime",
      value: nowTime(),
      required: "required"
    })));
    form.append(field("Note", el("textarea", {
      name: "mealNote",
      maxlength: "280",
      rows: "2",
      placeholder: "Optional. Anything you want to remember."
    })));
    var error = el("p", { class: "error", role: "alert" });
    form.append(error);
    form.append(el("button", { class: "btn btn-primary btn-block", type: "submit" }, "Save meal"));

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var name = form.mealName.value.trim();
      var typeInput = form.querySelector('input[name="mealType"]:checked');
      var time = normalizeTime(form.mealTime.value);
      var note = form.mealNote.value.trim();
      if (!name) {
        error.textContent = "Add a name so you can find this later.";
        form.mealName.focus();
        return;
      }
      if (!typeInput) {
        error.textContent = "Choose breakfast, lunch, dinner, or snack.";
        return;
      }
      if (!time) {
        error.textContent = "Add a time.";
        form.mealTime.focus();
        return;
      }
      var data = load();
      data.meals.push({
        id: uid(),
        name: name,
        type: typeInput.value,
        at: todayKey() + "T" + time,
        note: note
      });
      if (!persist(data)) {
        error.textContent = storageError;
        return;
      }
      go("#today");
    });
    return form;
  }

  function workoutForm() {
    var form = el("form", { novalidate: "novalidate", autocomplete: "off" });
    var activity = el("input", {
      type: "text",
      name: "activity",
      maxlength: "80",
      placeholder: "e.g. easy walk",
      required: "required",
      "data-autofocus": "true"
    });
    form.append(field("What you did", activity));

    var chips = el("div", { class: "chips" });
    WORKOUT_CHIPS.forEach(function (label) {
      var chip = el("button", {
        type: "button",
        class: "chip",
        "data-value": label,
        "aria-pressed": "false",
        onclick: function () {
          activity.value = label;
          syncChips();
          activity.focus();
        }
      }, label);
      chips.append(chip);
    });
    form.append(chips);

    function syncChips() {
      var value = activity.value.trim().toLowerCase();
      Array.prototype.forEach.call(chips.children, function (chip) {
        var on = chip.getAttribute("data-value").toLowerCase() === value;
        chip.setAttribute("aria-pressed", on ? "true" : "false");
      });
    }
    activity.addEventListener("input", syncChips);

    form.append(field("Minutes", el("input", {
      type: "number",
      name: "minutes",
      inputmode: "numeric",
      min: "1",
      max: "1440",
      step: "1",
      placeholder: "20",
      required: "required"
    })));
    form.append(field("Note", el("textarea", {
      name: "note",
      maxlength: "280",
      rows: "2",
      placeholder: "Optional."
    })));
    var error = el("p", { class: "error", role: "alert" });
    form.append(error);
    form.append(el("button", { class: "btn btn-primary btn-block", type: "submit" }, "Save workout"));

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var what = activity.value.trim();
      var minutes = Number(form.minutes.value);
      var note = form.note.value.trim();
      if (!what) {
        error.textContent = "Say what you did, even if it was small.";
        activity.focus();
        return;
      }
      if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) {
        error.textContent = "Add minutes as a whole number from 1 to 1440.";
        form.minutes.focus();
        return;
      }
      var data = load();
      data.workouts.push({
        id: uid(),
        activity: what,
        minutes: minutes,
        at: todayKey() + "T" + nowTime(),
        note: note
      });
      if (!persist(data)) {
        error.textContent = storageError;
        return;
      }
      go("#today");
    });
    return form;
  }

  function field(label, control) {
    return el("label", { class: "field" }, [
      el("span", { class: "field-label" }, label),
      control
    ]);
  }

  function normalizeTime(value) {
    var match = /^(\d{2}):(\d{2})/.exec(value || "");
    if (!match) return "";
    var hh = +match[1];
    var mm = +match[2];
    if (hh > 23 || mm > 59) return "";
    return pad(hh) + ":" + pad(mm);
  }

  function removeEntry(kind, id) {
    var data = load();
    var listName = kind === "meal" ? "meals" : "workouts";
    data[listName] = data[listName].filter(function (item) { return item.id !== id; });
    if (!persist(data)) {
      pendingDelete = null;
      render();
      return;
    }
    pendingDelete = null;
    var r = route();
    if (r.name === "day") {
      var left = onDate(data.meals, r.date).length + onDate(data.workouts, r.date).length;
      if (!left) {
        go("#history");
        return;
      }
    }
    render();
  }

  function actionBar() {
    return el("div", { class: "actionbar" }, [
      el("button", { type: "button", class: "btn btn-primary", onclick: function () { go("#meal"); } }, "Log meal"),
      el("button", { type: "button", class: "btn btn-secondary", onclick: function () { go("#workout"); } }, "Log workout")
    ]);
  }

  function tabBar(r) {
    var todayOn = r.name === "today" || r.name === "meal" || r.name === "workout";
    var histOn = r.name === "history" || r.name === "day";
    return el("nav", { class: "tabbar", "aria-label": "Sections" }, [
      el("button", {
        type: "button",
        onclick: function () { go("#today"); },
        "aria-current": todayOn ? "page" : null
      }, "Today"),
      el("button", {
        type: "button",
        onclick: function () { go("#history"); },
        "aria-current": histOn ? "page" : null
      }, "History")
    ]);
  }

  window.addEventListener("hashchange", render);
  render();

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("./sw.js", { scope: "./" }).catch(function () {});
    });
  }
})();
