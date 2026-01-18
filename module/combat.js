import { SYSTEM_ID } from "./constants.js";

export class WarhammerCombat extends Combat {
    /** @override */
    async startCombat() {
        // 1. Group Combatants by Army (Folder)
        const armies = this._identifyArmies();

        // 2. Roll Initiative for Armies (d6 roll off)
        // For now, simple random or based on folder name to keep it deterministic-ish for first pass
        // Actually, let's just use the current order of combatants to determine army order? 
        // No, let's roll.

        let armyInitiatives = [];
        for (const [folderId, combatants] of Object.entries(armies)) {
            const roll = await new Roll("1d6").evaluate();
            armyInitiatives.push({
                folderId,
                roll: roll.total,
                combatants
            });
        }

        // Sort armies by roll (desc)
        armyInitiatives.sort((a, b) => b.roll - a.roll);

        // 3. Re-order combatants based on Army Order
        // We want all combatants of Army 1, then Army 2.
        const sortedIds = [];
        for (const army of armyInitiatives) {
            // Sort internal combatants by name for neatness?
            // army.combatants.sort((a,b) => a.name.localeCompare(b.name));
            army.combatants.forEach(c => sortedIds.push(c.id));
        }

        // 4. Update Combatant Initiatives to simple integers (100, 90, etc to force sort)
        // Actually Combat.setupTurns sorts by initiative.
        // We'll just update the combat document with the new turn order if possible, 
        // or easier: Assign initiative values that force the sort.
        const updates = [];
        let initValue = 100 * armyInitiatives.length;
        for (const army of armyInitiatives) {
            for (const c of army.combatants) {
                updates.push({ _id: c.id, initiative: initValue });
            }
            initValue -= 100;
        }
        await this.updateEmbeddedDocuments("Combatant", updates);

        // Initialize State Flags
        await this.setFlag(SYSTEM_ID, "phase", "command");
        await this.setFlag(SYSTEM_ID, "armies", armyInitiatives.map(a => a.folderId));
        await this.setFlag(SYSTEM_ID, "cp", {}); // {folderId: value}
        await this.setFlag(SYSTEM_ID, "vp", {}); // {folderId: value}

        return super.startCombat();
    }

    _identifyArmies() {
        const armies = {};
        for (let c of this.combatants) {
            // Use folder ID as Army ID. If no folder, use "Unassigned"
            const actor = c.actor;
            const folderId = actor?.folder?.id || "unassigned";
            if (!armies[folderId]) armies[folderId] = [];
            armies[folderId].push(c);
        }
        return armies;
    }

    /** @override */
    async nextTurn() {
        // Standard Foundry nextTurn moves strictly to the next combatant.
        // We want to intercept this.

        // Use our custom method `nextPhase` as the primary driver.
        return this.nextPhase();
    }

    /** @override */
    async previousTurn() {
        return this.previousPhase();
    }

    async nextPhase() {
        const phases = ["command", "movement", "shooting", "charge", "fight"];
        const currentPhase = this.getFlag(SYSTEM_ID, "phase") || "command";
        const idx = phases.indexOf(currentPhase);

        if (idx < phases.length - 1) {
            // Advance Phase
            const newPhase = phases[idx + 1];
            await this.setFlag(SYSTEM_ID, "phase", newPhase);

            // Trigger Hooks or Effects?
            return this;
        } else {
            // Phase Loop Complete -> Switch Army
            // We need to jump to the first combatant of the NEXT army.
            // 1. Identify current army
            // 2. Identify next army
            // 3. Find index of first combatant of next army

            const currentTurnIndex = this.turn;
            const currentCombatant = this.turns[currentTurnIndex];
            if (!currentCombatant) return super.nextTurn(); // Fallback

            const currentArmyId = currentCombatant.actor?.folder?.id || "unassigned";

            // Find the index where the NEXT army starts
            let nextIndex = -1;

            // Scan forward
            for (let i = currentTurnIndex + 1; i < this.turns.length; i++) {
                const c = this.turns[i];
                const armyId = c.actor?.folder?.id || "unassigned";
                if (armyId !== currentArmyId) {
                    nextIndex = i;
                    break;
                }
            }

            // If found next army
            if (nextIndex !== -1) {
                // Reset phase to command
                await this.setFlag(SYSTEM_ID, "phase", "command");

                // Update foundry turn to that index
                // We use super.update({turn: nextIndex}) logic, but `nextTurn` does logic too.
                // We can't call super.nextTurn() because it increments by 1.
                // We must manually update the turn.
                return this.update({ turn: nextIndex });
            } else {
                // No next army -> End of Round
                await this.setFlag(SYSTEM_ID, "phase", "command");
                return super.nextRound(); // This resets turn to 0 (First Army)
            }
        }
    }

    async previousPhase() {
        const phases = ["command", "movement", "shooting", "charge", "fight"];
        const currentPhase = this.getFlag(SYSTEM_ID, "phase") || "command";
        const idx = phases.indexOf(currentPhase);

        if (idx > 0) {
            await this.setFlag(SYSTEM_ID, "phase", phases[idx - 1]);
            return this;
        } else {
            // Go back to previous Army?
            // This is complicated implementing generic "back". 
            // For now, let's just let previousTurn() do standard foundry behavior 
            // OR strictly phase back.
            // If at Command, maybe we shouldn't go back further easily without manual turn adjustment.
            return this;
        }
    }

    /* ------------------------------------------- */
    /*  Resource Management                        */
    /* ------------------------------------------- */

    async _onUpdate(data, options, userId) {
        super._onUpdate(data, options, userId);

        // Detect Turn Change or Phase Change to Command?
        // Actually `update` happens AFTER the change.

        // Check if we entered Command Phase
        const phaseChanged = data.flags?.[SYSTEM_ID]?.phase === "command";
        // Or if we changed Turns (Army Switch) AND it's command phase (default)
        const turnChanged = data.turn !== undefined; // If turn changed, we are likely at start of new army turn

        // Need to check if valid change
        if (!game.user.isGM) return;

        // If we started a new turn (Army Change), we should be in Command Phase automatically per my logic.
        // Let's ensure CP is added.

        if (turnChanged || (phaseChanged && this.getFlag(SYSTEM_ID, "phase") === "command")) {
            const combatant = this.combatant;
            if (combatant) {
                const armyId = combatant.actor?.folder?.id || "unassigned";
                await this.addCP(armyId, 1);

                // Also create chat message
                ChatMessage.create({
                    content: `<strong>Command Phase</strong>: ${combatant.actor?.folder?.name || "Army"} gains 1 CP.`
                });
            }
        }
    }

    async addCP(armyId, amount) {
        const history = this.getFlag(SYSTEM_ID, "cp") || {};
        const current = history[armyId] || 0;
        history[armyId] = Math.max(0, current + amount);
        return this.setFlag(SYSTEM_ID, "cp", history);
    }

    async addVP(armyId, amount) {
        const history = this.getFlag(SYSTEM_ID, "vp") || {};
        const current = history[armyId] || 0;
        history[armyId] = Math.max(0, current + amount);
        return this.setFlag(SYSTEM_ID, "vp", history);
    }
}
