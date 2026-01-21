import { SYSTEM_ID } from "./constants.js";

export class WarhammerCombatTracker extends CombatTracker {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            template: `systems/${SYSTEM_ID}/templates/combat/combat-tracker.hbs`,
        });
    }

    async getData(options) {
        console.log("Warhammer 40k | WarhammerCombatTracker.getData called");
        const context = await super.getData(options);
        const combat = this.viewed;

        context.hasCombat = combat !== null;

        if (!combat) return context;

        // Custom Data
        context.phase = combat.getFlag(SYSTEM_ID, "phase") || "setup";
        context.phases = {
            command: "Command",
            movement: "Movement",
            shooting: "Shooting",
            charge: "Charge",
            fight: "Fight"
        };
        context.phaseLabel = context.phases[context.phase];

        // Group by Army
        // We'll reconstruct the turn list to be visualizing Armies, not individual units
        // effectively replacing context.turns

        let armies = combat.getFlag(SYSTEM_ID, "armies") || [];
        const cp = combat.getFlag(SYSTEM_ID, "cp") || {};
        const vp = combat.getFlag(SYSTEM_ID, "vp") || {};

        if (armies.length === 0 && combat.combatants.size > 0) {
            const previewArmies = new Set();
            for (const c of combat.combatants) {
                const folderId = c.actor?.folder?.id || "unassigned";
                previewArmies.add(folderId);
            }
            armies = Array.from(previewArmies);
        }

        context.warhammerTurns = [];

        for (const folderId of armies) {
            let folderName = "Unassigned";
            if (folderId !== "unassigned") {
                const folder = game.folders.get(folderId);
                folderName = folder ? folder.name : folderId;
            }

            const isMyTurn = combat.combatant && combat.combatant.actor?.folder?.id === folderId;

            context.warhammerTurns.push({
                name: folderName,
                id: folderId,
                active: isMyTurn,
                cp: cp[folderId] || 0,
                vp: vp[folderId] || 0,
            });
        }

        // Also pass normal controls if needed, but we probably want custom buttons for CP/VP

        return context;
    }

    activateListeners(html) {
        super.activateListeners(html);

        html.find(".resource-control").click(this._onResourceControl.bind(this));
        html.find(".combat-control").click(this._onCombatControl.bind(this));
    }

    async _onResourceControl(event) {
        event.preventDefault();
        const btn = event.currentTarget;
        const action = btn.dataset.action;
        const armyId = btn.dataset.army;
        const resource = btn.dataset.resource; // 'cp' or 'vp'

        const combat = this.viewed;
        if (!combat) return;

        let delta = action === "add" ? 1 : -1;

        const flagKey = resource; // 'cp' or 'vp'
        const history = combat.getFlag(SYSTEM_ID, flagKey) || {};
        const current = history[armyId] || 0;

        history[armyId] = Math.max(0, current + delta);
        await combat.setFlag(SYSTEM_ID, flagKey, history);
    }
}
