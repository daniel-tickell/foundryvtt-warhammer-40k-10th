export class PhaseHUD extends Application {
    constructor() {
        super();
        this.token = null;
    }

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "phase-hud",
            template: "systems/warhammer-40k-10th/templates/apps/phase-hud.hbs",
            popOut: true,
            minimizable: false,
            classes: ["phase-hud"],
            tabs: [{ navSelector: ".tabs", contentSelector: ".content", initial: "movement" }]
        });
    }

    getData() {
        console.log("Warhammer 40k | PhaseHUD getData called");
        // Safe check
        if (!this.token || !this.token.actor) return {};

        const actor = this.token.actor;
        const system = actor.system;
        const items = actor.items;

        // Categorize Weapons
        const rangedWeapons = items.filter(i => i.type === "weapon" && i.system.range > 0);
        const meleeWeapons = items.filter(i => i.type === "weapon" && i.system.range === 0);

        return {
            stats: system.stats,
            rangedWeapons: rangedWeapons,
            meleeWeapons: meleeWeapons
        };
    }

    activateListeners(html) {
        super.activateListeners(html);

        html.find('.phase-action').click(this._onAction.bind(this));
        html.find('.roll-weapon').click(this._onRollWeapon.bind(this));
    }

    async _onAction(event) {
        event.preventDefault();
        const action = event.currentTarget.dataset.action;
        const actor = this.token.actor;

        if (action === "advance") {
            const move = parseInt(actor.system.stats.move) || 0;
            const roll = await new Roll("1d6").evaluate({ async: true });
            roll.toMessage({
                speaker: ChatMessage.getSpeaker({ actor: actor }),
                flavor: `<strong>Advances!</strong><br>Base: ${move}" + Roll: ${roll.total}" = <strong>${move + roll.total}"</strong>`
            });
        }
        else if (action === "charge") {
            const roll = await new Roll("2d6").evaluate({ async: true });
            roll.toMessage({
                speaker: ChatMessage.getSpeaker({ actor: actor }),
                flavor: `<strong>Charge!</strong><br>Distance: <strong>${roll.total}"</strong>`
            });
        }
        else if (action === "fallback") {
            ChatMessage.create({
                speaker: ChatMessage.getSpeaker({ actor: actor }),
                content: `<strong>Falls Back!</strong><br>${actor.name} retreats from combat.`
            });
        }
        else if (action === "pilein") {
            ChatMessage.create({
                speaker: ChatMessage.getSpeaker({ actor: actor }),
                content: `<strong>Piles In!</strong><br>${actor.name} moves up to 3" closer.`
            });
        }
        else if (action === "consolidate") {
            ChatMessage.create({
                speaker: ChatMessage.getSpeaker({ actor: actor }),
                content: `<strong>Consolidates!</strong><br>${actor.name} moves up to 3" towards enemy.`
            });
        }
    }

    async _onRollWeapon(event) {
        event.preventDefault();
        const itemId = event.currentTarget.dataset.itemId;
        const item = this.token.actor.items.get(itemId);
        if (item) {
            const system = item.system;
            // 1. Determine Number of Attacks
            let numAttacks = 1;
            try {
                // Attacks can be "4" or "D6+1"
                let attacksRoll = new Roll(system.attacks.toString());
                await attacksRoll.evaluate({ async: true });
                numAttacks = attacksRoll.total;
            } catch (e) {
                console.warn("Failed to parse attacks:", system.attacks);
            }

            // 2. Roll Hit Dice
            let hitRoll = new Roll(`${numAttacks}d6`);
            await hitRoll.evaluate({ async: true });

            // 3. Construct Chat Message
            let content = `
                <div class="warhammer-roll">
                    <h3>${item.name}</h3>
                    <div class="stats">
                        <span><strong>Attacks:</strong> ${numAttacks}</span>
                        <span><strong>Skill:</strong> ${system.skill}+</span>
                        <span><strong>S:</strong> ${system.strength}</span>
                        <span><strong>AP:</strong> ${system.ap}</span>
                        <span><strong>D:</strong> ${system.damage}</span>
                    </div>
                    <hr>
                    <div class="roll-result">
                        <strong>Hit Roll (${numAttacks} dice):</strong>
                        <div class="dice-tooltip">${hitRoll.result}</div>
                        <div class="roll-total">Total Hits: TBD vs ${system.skill}+</div> 
                    </div>
                </div>
            `;
            // Simple visual check for now. Foundry's default roll template is better but let's just push the roll.

            hitRoll.toMessage({
                speaker: ChatMessage.getSpeaker({ actor: this.token.actor }),
                flavor: `<strong>${item.name}</strong> - Attack Roll (Skill: ${system.skill}+)<br>
                         S:${system.strength} AP:${system.ap} D:${system.damage}`,
            });
        }
    }



    // ...

    setToken(token) {
        console.log(`Warhammer 40k | PhaseHUD setToken called with: ${token ? token.name : 'null'}`);
        this.token = token;
        if (token) {
            this.render(true);
        } else {
            this.close();
        }
    }
}
