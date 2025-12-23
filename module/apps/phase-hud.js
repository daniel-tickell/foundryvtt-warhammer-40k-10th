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
        this.token.actor.rollWeapon(itemId);
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
