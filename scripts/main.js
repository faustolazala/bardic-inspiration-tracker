const MODULE_ID = "bardic-inspiration-tracker";
const FLAGS = {
  world: "world",
  party: "partyActorIds",
  bard: "bardActorId",
  manualDie: "manualDie",
  hasInspiration: "hasBardicInspiration"
};

Hooks.once("init", () => {
  console.log(`${MODULE_ID} | Initializing`);
});

Hooks.on("getActorSheetHeaderButtons", (app, buttons) => {
  if (!game.user.isGM) return;
  const actor = app.actor ?? app.document;
  if (!actor || actor.type !== "character") return;

  buttons.unshift({
    label: game.i18n.localize("BIT.TrackerButton"),
    class: "bit-open-config",
    icon: "fas fa-music",
    onclick: () => openConfigDialog(actor)
  });
});

Hooks.on("renderActorSheet", (app, html) => {
  const actor = app.actor ?? app.document;
  if (!actor || actor.type !== "character") return;

  const root = html instanceof jQuery ? html[0] : html;
  if (!root) return;

  const sheetBody = root.querySelector(".window-content") ?? root;
  const existing = root.querySelector(`.bit-sheet-panel[data-appid=\"${app.appId}\"]`);
  if (existing) existing.remove();

  root.style.position = root.style.position || "relative";

  const panel = buildTrackerPanel(actor, app.appId);
  sheetBody.appendChild(panel);
  bindPanelEvents(panel, actor);
});

Hooks.on("closeActorSheet", (app) => {
  const el = document.querySelector(`.bit-sheet-panel[data-appid=\"${app.appId}\"]`);
  el?.remove();
});

Hooks.on("updateActor", (actor) => {
  rerenderOpenPanels();
});

Hooks.on("controlToken", () => {
  rerenderOpenPanels();
});

function rerenderOpenPanels() {
  for (const app of Object.values(ui.windows)) {
    const actor = app?.actor ?? app?.document;
    if (!actor || app?.constructor?.name?.includes("Actor") === false) continue;
    if (typeof app.render === "function") app.render(false);
  }
}

function getWorldConfig() {
  const cfg = game.world.getFlag(MODULE_ID, FLAGS.world) ?? {};
  return {
    partyActorIds: Array.isArray(cfg[FLAGS.party]) ? cfg[FLAGS.party] : [],
    bardActorId: cfg[FLAGS.bard] ?? "",
    manualDie: cfg[FLAGS.manualDie] ?? ""
  };
}

async function setWorldConfig(data) {
  return game.world.setFlag(MODULE_ID, FLAGS.world, {
    [FLAGS.party]: data.partyActorIds,
    [FLAGS.bard]: data.bardActorId,
    [FLAGS.manualDie]: data.manualDie
  });
}

function getPartyActors() {
  const cfg = getWorldConfig();
  return cfg.partyActorIds.map(id => game.actors.get(id)).filter(Boolean);
}

function getBardActor() {
  const cfg = getWorldConfig();
  return game.actors.get(cfg.bardActorId) ?? null;
}

function userCanConsumeInspiration(actor) {
  return game.user.isGM || actor.isOwner;
}

function userCanGrantInspiration(actor) {
  return game.user.isGM || getBardActor()?.isOwner;
}

function actorHasInspiration(actor) {
  return Boolean(actor.getFlag(MODULE_ID, FLAGS.hasInspiration));
}

async function setActorInspiration(actor, value) {
  return actor.setFlag(MODULE_ID, FLAGS.hasInspiration, Boolean(value));
}

function buildTrackerPanel(sheetActor, appId) {
  const cfg = getWorldConfig();
  const bardActor = getBardActor();
  const die = resolveBardicDie();
  const party = getPartyActors();

  const wrapper = document.createElement("section");
  wrapper.classList.add("bit-sheet-panel");
  wrapper.dataset.appid = String(appId);

  const bardLabel = bardActor
    ? game.i18n.format("BIT.FromBard", { name: bardActor.name })
    : game.i18n.localize("BIT.BardNotSet");
  const dieLabel = die ? game.i18n.format("BIT.Die", { die }) : game.i18n.localize("BIT.RollUnknown");

  wrapper.innerHTML = `
    <div class="bit-header">
      <div class="bit-title">${game.i18n.localize("BIT.Title")}</div>
      ${game.user.isGM ? `<button type="button" class="bit-config" title="${game.i18n.localize("BIT.Configure")}"><i class="fas fa-cog"></i></button>` : ""}
    </div>
    <div class="bit-meta">
      <div>${bardLabel}</div>
      <div>${dieLabel}</div>
    </div>
    <div class="bit-party">
      ${party.length ? party.map(actor => renderPartyMember(actor)).join("") : `<div class="bit-empty">${game.i18n.localize("BIT.NoParty")}</div>`}
    </div>
  `;

  return wrapper;
}

function renderPartyMember(actor) {
  const hasIt = actorHasInspiration(actor);
  const title = hasIt ? game.i18n.localize("BIT.Roll") : game.i18n.localize("BIT.NoInspiration");
  return `
    <div class="bit-member" data-actor-id="${actor.id}">
      <img src="${actor.img}" alt="${actor.name}">
      <div class="bit-member-name">${actor.name}</div>
      <button type="button" class="bit-inspiration-toggle ${hasIt ? "has-inspiration" : ""}" title="${title}">
        <i class="fas fa-music"></i>
      </button>
    </div>
  `;
}

function bindPanelEvents(panel, sheetActor) {
  panel.querySelector(".bit-config")?.addEventListener("click", () => openConfigDialog(sheetActor));

  for (const button of panel.querySelectorAll(".bit-inspiration-toggle")) {
    button.addEventListener("click", async (event) => {
      const actorId = event.currentTarget.closest(".bit-member")?.dataset.actorId;
      const actor = game.actors.get(actorId);
      if (!actor) return;

      const hasIt = actorHasInspiration(actor);

      if (hasIt) {
        if (!userCanConsumeInspiration(actor)) return;
        await rollAndConsumeInspiration(actor);
      } else {
        if (!userCanGrantInspiration(actor)) return;
        await setActorInspiration(actor, true);
        ui.notifications.info(`${actor.name} gains Bardic Inspiration.`);
      }
    });
  }
}

async function rollAndConsumeInspiration(actor) {
  const die = resolveBardicDie();
  if (!die) {
    ui.notifications.warn(game.i18n.localize("BIT.RollUnknown"));
    return;
  }

  const roll = await (new Roll(`1${die}`)).evaluate();
  await roll.toMessage({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor: `${game.i18n.localize("BIT.RollFlavor")}: ${actor.name}`
  });
  await setActorInspiration(actor, false);
}

function resolveBardicDie() {
  const cfg = getWorldConfig();
  const manual = normalizeDie(cfg.manualDie);
  if (manual) return manual;

  const bard = getBardActor();
  if (!bard) return null;

  const candidateValues = [
    bard?.system?.attributes?.bardicInspiration,
    bard?.system?.scale?.bard?.bardicInspiration,
    bard?.system?.scale?.bard?.inspiration,
    bard?.system?.details?.bardicInspiration
  ];

  for (const item of bard.items ?? []) {
    candidateValues.push(
      item?.system?.scale?.bard?.bardicInspiration,
      item?.system?.scale?.bard?.inspiration,
      item?.system?.bardicInspiration
    );
  }

  for (const value of candidateValues) {
    const normalized = normalizeDie(value);
    if (normalized) return normalized;
  }

  const bardLevel = inferBardLevel(bard);
  if (!bardLevel) return null;
  if (bardLevel >= 15) return "d12";
  if (bardLevel >= 10) return "d10";
  if (bardLevel >= 5) return "d8";
  return "d6";
}

function inferBardLevel(actor) {
  const direct = Number(actor?.system?.classes?.bard?.levels);
  if (Number.isFinite(direct) && direct > 0) return direct;

  const bardClass = (actor.items ?? []).find(i => {
    const type = String(i.type ?? "").toLowerCase();
    const name = String(i.name ?? "").toLowerCase();
    return type === "class" && name === "bard";
  });

  const fromItem = Number(bardClass?.system?.levels ?? bardClass?.system?.level ?? bardClass?.system?.advancement?.level);
  if (Number.isFinite(fromItem) && fromItem > 0) return fromItem;

  const actorLevel = Number(actor?.system?.details?.level ?? actor?.system?.attributes?.level);
  if (Number.isFinite(actorLevel) && actorLevel > 0) return actorLevel;

  return null;
}

function normalizeDie(value) {
  if (value == null) return null;
  if (typeof value === "number" && Number.isFinite(value)) return `d${value}`;
  const text = String(value).trim().toLowerCase();
  const match = text.match(/d?(4|6|8|10|12)/i);
  return match ? `d${match[1]}` : null;
}

function openConfigDialog(contextActor) {
  const actors = game.actors.filter(a => a.type === "character").sort((a, b) => a.name.localeCompare(b.name));
  const cfg = getWorldConfig();

  const content = `
    <form class="bit-config-dialog">
      <div class="bit-dialog-field">
        <label>${game.i18n.localize("BIT.Bard")}</label>
        <select name="bardActorId">
          <option value="">—</option>
          ${actors.map(actor => `<option value="${actor.id}" ${cfg.bardActorId === actor.id ? "selected" : ""}>${actor.name}</option>`).join("")}
        </select>
      </div>
      <div class="bit-dialog-field">
        <label>${game.i18n.localize("BIT.ManualDie")}</label>
        <input type="text" name="manualDie" value="${cfg.manualDie ?? ""}" placeholder="d6">
        <div class="hint">${game.i18n.localize("BIT.ManualDieHint")}</div>
      </div>
      <div class="bit-dialog-field">
        <label>${game.i18n.localize("BIT.PartyMembers")}</label>
        <div class="bit-checkbox-list">
          ${actors.map(actor => `
            <label>
              <input type="checkbox" name="partyActorIds" value="${actor.id}" ${cfg.partyActorIds.includes(actor.id) ? "checked" : ""}>
              ${actor.name}
            </label>
          `).join("")}
        </div>
      </div>
    </form>
  `;

  const dialog = new foundry.applications.api.DialogV2({
    window: { title: game.i18n.localize("BIT.Configure") },
    content,
    buttons: [
      {
        action: "save",
        label: game.i18n.localize("BIT.Save"),
        default: true,
        callback: async (event, button, dialogInstance) => {
          const form = dialogInstance.element.querySelector("form");
          const fd = new FormData(form);
          const bardActorId = String(fd.get("bardActorId") ?? "");
          const manualDie = String(fd.get("manualDie") ?? "").trim();
          const partyActorIds = Array.from(form.querySelectorAll("input[name='partyActorIds']:checked")).map(i => i.value);
          await setWorldConfig({ bardActorId, manualDie, partyActorIds });
          rerenderOpenPanels();
        }
      }
    ]
  });

  dialog.render(true);
}
