import { WarhammerItem } from "./items/item.js";
import { WarhammerActor } from "./actors/actor.js";
import { WarhammerModelSheet } from "./actors/actor-sheet.js";
import { getBaseToBaseDist, mmToInch, SYSTEM_ID } from "./constants.js";
import { preloadHandlebarsTemplates } from "./templates.js";
import { WarhammerModelData } from "./actors/warhammerModelData.js";
import { WeaponData } from "./items/weaponData.js";
import { WeaponTagData } from "./items/weaponTagData.js";
import { WarhammerAbilitySheet } from "./items/warhammer-ability-sheet.js";
import { WarhammerWeaponSheet } from "./items/warhammer-weapon-sheet.js";
import { WarhammerWTagSheet } from "./items/warhammer-wtag-sheet.js";
import { WarhammerRuler } from "./warhammerRuler.js";
import { WarhammerToken, WarhammerTokenDocument } from "./token.js";
import "../libs/awesomplete/awesomplete.js"
import { WarhammerObjectiveData } from "./actors/warhammerObjectiveData.js";
import { WarhammerObjectiveSheet } from "./actors/objective-sheet.js";
/* -------------------------------------------- */
/* -------------------------------------------- */
/*  Foundry VTT Initialization                  */
/* -------------------------------------------- */
console.log("Warhammer 40k | System Module Loading...");
/**
 * Init hook.
 */
Hooks.once('init', function () {

    // Add utility classes to the global game object so that they're more easily
    // accessible in global contexts.
    game.warhammer = {
        WarhammerActor,
        WarhammerItem,
    };

    // Add custom constants for configuration.
    CONFIG.WARHAMMER = {};

    //define data models
    CONFIG.Actor.dataModels.model = WarhammerModelData;
    CONFIG.Actor.dataModels.objective = WarhammerObjectiveData;
    CONFIG.Item.dataModels.weapon = WeaponData;
    CONFIG.Item.dataModels.wtag = WeaponTagData;

    // Define custom Document classes
    CONFIG.Actor.documentClass = WarhammerActor;
    CONFIG.Item.documentClass = WarhammerItem;
    CONFIG.Token.documentClass = WarhammerTokenDocument;
    game.settings.register(SYSTEM_ID, "baseSizes", {
        name: "Base Sizes",
        scope: "world",
        config: false,
        type: Object,
        default: {}
    });

    CONFIG.statusEffects = [
        {
            id: "battleshocked",
            label: "Battleshocked",
            icon: "icons/svg/skull.svg"
        },
        {
            id: "suppressed",
            label: "Suppressed",
            icon: "icons/svg/downgrade.svg"
        },
        {
            id: "stealth",
            label: "Stealth",
            icon: "icons/svg/blind.svg"
        },
        {
            id: "cover",
            label: "Benefit of Cover",
            icon: "icons/svg/shield.svg"
        },
        {
            id: "advance",
            label: "Advanced",
            icon: "icons/svg/up.svg"
        },
        {
            id: "fallback",
            label: "Fell Back",
            icon: "icons/svg/cowled.svg"
        }
    ];

    CONFIG.Combat.initiative = {
        formula: '1d6',
        decimals: 2,
    };
    // Register sheet application classes
    const Actors = foundry.documents.collections.Actors;
    const Items = foundry.documents.collections.Items;
    Actors.unregisterSheet("core", ActorSheet);
    Actors.registerSheet(SYSTEM_ID, WarhammerModelSheet, { types: ["model"], makeDefault: true });
    Actors.registerSheet(SYSTEM_ID, WarhammerObjectiveSheet, { types: ["objective"], makeDefault: true });
    Items.unregisterSheet("core", ItemSheet);
    Items.registerSheet(SYSTEM_ID, WarhammerAbilitySheet, { types: ["ability"], makeDefault: true });
    Items.registerSheet(SYSTEM_ID, WarhammerWeaponSheet, { types: ["weapon"], makeDefault: true });
    Items.registerSheet(SYSTEM_ID, WarhammerWTagSheet, { types: ["wtag"], makeDefault: true });

    // DocumentSheetConfig.registerSheet(TokenDocument, SYSTEM_ID, WarhammerTokenConfig, { makeDefault: true });

    game.settings.register(SYSTEM_ID, 'melee_generosity', {
        name: 'Melee Generosity',
        hint: "extra reach granted to melee weapons in inches",
        scope: 'world',     // "world" = sync to db, "client" = local storage
        config: true,       // false if you dont want it to show in module config
        type: Number,       // Number, Boolean, String, Object
        default: 0.1,
    });
    game.settings.register(SYSTEM_ID, "lastToggleState", {
        scope: "client",
        config: false,
        type: Boolean,
        default: true,
    });
    window.tokenRuler = {
        active: game.settings.get(SYSTEM_ID, "lastToggleState"),
        getBaseToBaseDist,
    };
    CONFIG.Canvas.rulerClass = WarhammerRuler;
    CONFIG.Token.objectClass = WarhammerToken;

    return preloadHandlebarsTemplates();
});

//turn tag string into array of tags
Hooks.on('preUpdateActor', function (actor, change, options, userid) {
    if (change?.system?.baseSize) {
        if (!change.prototypeToken) {
            change.prototypeToken = { height: 0, width: 0 }
        }
        change.prototypeToken.height = mmToInch(change.system.baseSize) //convert mm to inches
        change.prototypeToken.width = mmToInch(change.system.baseSize)
    }
})
Hooks.on('preCreateActor', function (actor, data, options, userid) {
    actor.updateSource({
        prototypeToken: {
            height: mmToInch(actor.system.baseSize),
            width: mmToInch(actor.system.baseSize),
        }
    })
    if (actor.type === "objective") {
        actor.updateSource({
            img: "icons/svg/target.svg",
            prototypeToken: {
                displayName: CONST.TOKEN_DISPLAY_MODES.ALWAYS,
                texture: {
                    src: "icons/svg/target.svg",
                    tint: "#000000",
                }
            }
        })
    }
})
//stolen from https://gitlab.com/tposney/midi-qol/-/blob/v11/src/module/chatMessageHandling.ts
Hooks.on('renderChatMessage', function (message, html, messageData) {
    let _highlighted = null;

    let _onTargetHover = (event) => {
        event.preventDefault();
        if (!canvas?.scene?.active) return;
        const token = canvas?.tokens?.get(event.currentTarget.id);
        if (token?.isVisible) {
            if (!token?._controlled) token._onHoverIn(event);
            _highlighted = token;
        }
    }

    /* -------------------------------------------- */

    /**
     * Handle mouse-unhover events for a combatant in the chat card
     * @private
     */
    let _onTargetHoverOut = (event) => {
        event.preventDefault();
        if (!canvas?.scene?.active) return;
        if (_highlighted) _highlighted._onHoverOut(event);
        _highlighted = null;
    }

    let _onTargetSelect = (event) => {
        event.preventDefault();
        if (!canvas?.scene?.active) return;
        const token = canvas.tokens?.get(event.currentTarget.id);
        token?.control({ multiSelect: false, releaseOthers: true });
    };


    let ids = html.find(".selectable-target-name")

    ids.hover(_onTargetHover, _onTargetHoverOut)
    ids.click(_onTargetSelect);
})


export let tokenRulerTool;
// Inject Terrain Ruler into the scene control buttons
Hooks.on("getSceneControlButtons", controls => {
    if (!tokenRulerTool) {
        tokenRulerTool = {
            name: "tokenRuler",
            title: "measure base-to-base",
            icon: "fas fa-circle-nodes",
            toggle: true,
            active: tokenRuler?.active,
            onClick: updateTokenRulerState,
            visible: true,
        }
    }
    // Handle case where controls might not be the array we expect
    if (!controls || !Array.isArray(controls)) return;

    const tokenGroup = controls.find(group => group.name === "token");
    if (tokenGroup) {
        const tokenControls = tokenGroup.tools;
        tokenControls.splice(tokenControls.findIndex(tool => tool.name === "ruler") + 1, 0, tokenRulerTool)
    }
})

function updateTokenRulerState(newState) {
    tokenRuler.active = newState;
    game.settings.set(SYSTEM_ID, "lastToggleState", newState);
}

Hooks.on("renderActiveEffectConfig", function (application, html, data) {
    let inputs = html.find(".key input")
    $.map(inputs, input => {
        new Awesomplete(input, {
            list: Object.keys(foundry.utils.flattenObject(application.object.parent.system)).map(s => "system." + s)
        });
    })
})

Hooks.on("renderTokenConfig", function (config, html, data) {
    let injectedHTML = `
            <div class="form-group slim">
            <label>Art Offset</label>
            <div class="form-fields">
                <label>X</label>
                <input type="number" step="1" name="flags.${SYSTEM_ID}.offX" placeholder="px" ${config.token.getFlag(SYSTEM_ID, "offX") ? "value=\"" + config.token.getFlag(SYSTEM_ID, "offX") + "\"" : ""}>
                <label>Y</label>
                <input type="number" step="1" name="flags.${SYSTEM_ID}.offY" placeholder="px" ${config.token.getFlag(SYSTEM_ID, "offY") ? "value=\"" + config.token.getFlag(SYSTEM_ID, "offY") + "\"" : ""}>
            </div>
        </div>
`
    html.find("[name=width]").closest(".form-group").after(injectedHTML)
})

let updateObjectives = foundry.utils.debounce(() => {
    let objectives = canvas.tokens.placeables.filter(x => x.actor?.type === "objective")
    objectives.map(x => x.actor.updateObjective(x))
}, 50
)
Hooks.on("refreshToken", (token, flags) => {
    if (flags.refreshBar || flags.refreshPosition)
        updateObjectives()
})


Hooks.once("dragRuler.ready", (SpeedProvider) => {
    class WarhammerSpeedProvider extends SpeedProvider {
        get colors() {
            return [
                { id: "move", default: 0x00FF00, name: "NORMAL MOVE" },
            ]
        }

        getRanges(token) {
            if (token.actor.type === "objective")
                return []

            const baseSpeed = token.actor.system.stats.move

            return [
                { range: baseSpeed, color: "move" },
            ]
        }
    }

    dragRuler.registerSystem(SYSTEM_ID, WarhammerSpeedProvider)
})

Hooks.on('renderActorDirectory', (app, html, data) => {

    //return early if user isn't a gm (and thus can't create folders, which the importer does)
    if (!game.user.isGM) return

    console.log("Warhammer 40k | Hook renderActorDirectory fired");
    const $html = $(html);
    console.log("Warhammer 40k | Directory HTML classes:", $html[0]?.className);

    // Try multiple selectors to find the correct container for buttons
    let actions = $html.find('.header-actions.action-buttons');
    if (!actions.length) actions = $html.find('.header-actions');
    if (!actions.length) actions = $html.find('.action-buttons');

    // Fallback: directory header itself if we really can't find the buttons area
    if (!actions.length) {
        console.warn("Warhammer 40k | Specific action container not found. Checking .directory-header");
        const dirHeader = $html.find('.directory-header');
        if (dirHeader.length) {
            console.log("Warhammer 40k | Found .directory-header, creating a container.");
            // Create a container if it doesn't exist, to keep things tidy
            actions = $(`<div class="header-actions action-buttons flexrow"></div>`);
            dirHeader.append(actions);
        }
    }

    console.log("Warhammer 40k | Final actions container length:", actions.length);

    if (actions.length) {
        const btn = $(`<button class='import-roster'><i class="fas fa-file-import"></i> Import Roster</button>`);

        // Avoid duplicate buttons if the hook fires multiple times
        if (actions.find('.import-roster').length === 0) {
            actions.append(btn);
            btn.click((ev) => {
                ev.preventDefault();
                renderImportDialog();
            });
            console.log("Warhammer 40k | Import Roster button injected successfully.");
        } else {
            console.log("Warhammer 40k | Import Roster button already exists.");
        }

        const updateBtn = $(`<button class='update-sizes'><i class="fas fa-ruler-combined"></i> Update Base Sizes</button>`);
        if (actions.find('.update-sizes').length === 0) {
            actions.append(updateBtn);
            updateBtn.click((ev) => {
                ev.preventDefault();
                Dialog.confirm({
                    title: "Update All Base Sizes",
                    content: "<p>This will iterate through <strong>ALL</strong> actors in your world and attempt to update their prototype token sizes based on their name using Wahapedia data.<br><br>Are you sure you want to continue?</p>",
                    yes: async () => {
                        const { RosterImporter } = await import("./importer.js");
                        RosterImporter.updateAllBaseSizes();
                    },
                    defaultYes: false
                });
            });
            console.log("Warhammer 40k | Update Base Sizes button injected successfully.");
        }

    } else {
        console.error("Warhammer 40k | Failed to find OR create a container to inject Import Roster button");
        // Last ditch effort: Inject directly into the main html container
        console.warn("Warhammer 40k | Attempting last-ditch injection into root.");
        const btn = $(`<button class='import-roster'><i class="fas fa-file-import"></i> Import Roster</button>`);
        $html.prepend(btn);
        btn.click((ev) => {
            ev.preventDefault();
            renderImportDialog();
        });
    }
});





function renderImportDialog() {
    new Dialog({
        title: "Roster Import",
        content: "<form autocomplete=\"off\" onsubmit=\"event.preventDefault();\">\n" +
            "    <p class=\"notes\">You may import a roster in the .ros format</p>\n" +
            "    <div class=\"form-group\">\n" +
            "        <label for=\"data\">Roster File</label>\n" +
            "        <input type=\"file\" name=\"data\" accept='.ros,.json'/>\n" +
            "    </div>\n",
        buttons: {
            updateSizes: {
                icon: '<i class="fas fa-ruler-combined"></i>',
                label: "Update Base Sizes",
                callback: async () => {
                    const { RosterImporter } = await import("./importer.js");
                    await RosterImporter.fetchBaseSizes();
                    ui.notifications.info("Base sizes updated from Wahapedia");
                }
            },
            import: {
                icon: "<i class=\"fas fa-file-import\"></i>",
                label: "Import",
                cssClass: "import default",
                callback: async html => {
                    const form = html.find("form")[0];
                    if (!form.data.files.length) return ui.notifications.error("You did not upload a data file!");
                    const { RosterImporter } = await import("./importer.js");
                    readTextFromFile(form.data.files[0]).then(content => RosterImporter.import(content));
                }
            },
            no: {
                icon: "<i class=\"fas fa-times\"></i>",
                label: "Cancel",
                cssClass: "no"
            }
        }
    }).render(true);
}

// Phase HUD Integration
Hooks.once("ready", async () => {
    // Dynamically import the class to avoid circular dependencies if any
    const { PhaseHUD } = await import("./apps/phase-hud.js");
    game.phaseHUD = new PhaseHUD();

    // Hook to show/hide
    Hooks.on("controlToken", (token, controlled) => {
        if (controlled) {
            // Only show if we have permission
            if (token.actor && token.actor.testUserPermission(game.user, "OWNER")) {
                game.phaseHUD.setToken(token);
            }
        } else {
            // If we deselected, check if we have ANY controlled tokens
            const supervised = canvas.tokens.controlled.filter(t => t.actor && t.actor.testUserPermission(game.user, "OWNER"));
            if (supervised.length > 0) {
                game.phaseHUD.setToken(supervised[0]);
            } else {
                game.phaseHUD.setToken(null);
            }
        }
    });

    // Hook updates to refresh if open
    Hooks.on("updateActor", (actor) => {
        if (game.phaseHUD.token && game.phaseHUD.token.actor === actor) game.phaseHUD.render(false);
    });

    // Chat Message Listeners
    Hooks.on("renderChatMessage", (message, html, data) => {
        const $html = $(html); // Ensure jQuery object

        // Roll Attacks Listener
        $html.find(".roll-attacks").click(async (ev) => {
            ev.preventDefault();
            const btn = $(ev.currentTarget);
            const attacksFormula = btn.data("attacks").toString();
            const skill = parseInt(btn.data("skill")) || 6;
            const strength = btn.data("strength");
            const ap = btn.data("ap");
            const damage = btn.data("damage");
            const weaponName = btn.data("weapon");

            // 1. Determine Number of Attacks
            let numAttacks = 1;
            try {
                let attacksRoll = new Roll(attacksFormula);
                await attacksRoll.evaluate();
                numAttacks = attacksRoll.total;
            } catch (e) {
                console.warn("Failed to parse attacks:", attacksFormula);
            }

            // 2. Roll Hit Dice
            let hitRoll = new Roll(`${numAttacks}d6`);
            await hitRoll.evaluate();

            // 3. Count Hits
            let hits = 0;
            let crits = 0;
            const dice = hitRoll.terms.find(t => t.faces === 6);
            if (dice) {
                dice.results.forEach(r => {
                    if (r.result >= skill || r.result === 6) hits++;
                    if (r.result === 6) crits++;
                });
            }

            // 4. Post Hit Result Card
            const woundBtn = hits > 0 ? `
                <button class="roll-wounds" 
                    data-hits="${hits}" 
                    data-strength="${strength}" 
                    data-ap="${ap}" 
                    data-damage="${damage}"
                    data-weapon="${weaponName}">
                    Roll Wounds <i class="fas fa-dice"></i>
                </button>` : '';

            ChatMessage.create({
                speaker: ChatMessage.getSpeaker({ actor: message.speaker.actor }),
                content: `
                <div class="warhammer-roll">
                    <h3>${weaponName}: Attack Roll</h3>
                    <div class="stats">
                        <span><strong>Attacks:</strong> ${numAttacks}</span>
                        <span><strong>Skill:</strong> ${skill}+</span>
                    </div>
                    <hr>
                     <div class="roll-summary" style="font-size: 1.2em; text-align: center; margin-top: 5px; margin-bottom: 5px;">
                        <span style="color: green; font-weight: bold;">${hits} Hits</span>
                        ${crits > 0 ? `<span style="color: darkorange; font-size: 0.8em;">(${crits} Crits)</span>` : ''}
                    </div>
                    <div class="dice-tooltip" style="font-size: 0.8em; color: #555;">${hitRoll.result}</div>
                    ${woundBtn}
                </div>`
            });
        });

        // Roll Wounds Listener
        $html.find(".roll-wounds").click(async (ev) => {
            ev.preventDefault();
            const btn = $(ev.currentTarget);
            const hits = parseInt(btn.data("hits"));
            const strength = parseInt(btn.data("strength"));
            const ap = btn.data("ap");
            const damage = btn.data("damage");
            const weaponName = btn.data("weapon");

            // 1. Get Target Toughness
            let toughness = 4; // Default
            let targetName = "Target";
            const targets = game.user.targets;
            if (targets.size > 0) {
                const target = targets.first();
                toughness = parseInt(target.actor?.system?.stats?.toughness) || 4;
                targetName = target.name;
            } else {
                // Ask for toughness
                const tInput = await new Promise(resolve => {
                    new Dialog({
                        title: "Target Toughness",
                        content: `<div class="form-group"><label>Toughness:</label><input type="number" id="toughness" value="4" autofocus></div>`,
                        buttons: {
                            ok: { label: "Roll", callback: html => resolve(html.find("#toughness").val()) }
                        },
                        default: "ok"
                    }).render(true);
                });
                toughness = parseInt(tInput) || 4;
            }

            // 2. Calculate To Wound Target
            let targetNum = 4;
            if (strength >= toughness * 2) targetNum = 2;
            else if (strength > toughness) targetNum = 3;
            else if (strength == toughness) targetNum = 4;
            else if (strength <= toughness / 2) targetNum = 6;
            else if (strength < toughness) targetNum = 5;

            // 3. Roll Dice
            const roll = await new Roll(`${hits}d6`).evaluate();
            let wounds = 0;
            roll.terms.find(t => t.faces === 6).results.forEach(r => {
                if (r.result >= targetNum) wounds++;
            });

            // 4. Post Message
            ChatMessage.create({
                speaker: ChatMessage.getSpeaker({ actor: message.speaker.actor }), // Use same speaker
                content: `
                    <div class="warhammer-roll">
                        <h3>Wound Roll vs ${targetName}</h3>
                        <div class="stats">
                            <span><strong>Weapon:</strong> ${weaponName}</span>
                            <span><strong>S:</strong> ${strength} vs <strong>T:</strong> ${toughness}</span>
                            <span><strong>Target:</strong> ${targetNum}+</span>
                        </div>
                        <hr>
                        <div class="roll-summary" style="font-size: 1.2em; text-align: center; margin-top: 5px;">
                            <span style="color: red; font-weight: bold;">${wounds} Wounds</span>
                        </div>
                        <div class="damage-info" style="margin-top: 5px; font-size: 0.9em; border-top: 1px solid #ccc; padding-top: 2px;">
                            <strong>AP:</strong> ${ap} | <strong>Damage:</strong> ${damage}
                            <br>Target needs to save!
                        </div>
                         <div class="dice-tooltip" style="margin-top:5px; font-size:0.8em; color:#666;">
                            Rolling ${hits}d6: ${roll.result}
                        </div>
                    </div>
                `
            });
        });
    });
});