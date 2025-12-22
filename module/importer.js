import { FACTIONS, SYSTEM_ID } from "./constants.js";

const OPTIONAL_TAGS = ['HEAVY', 'LANCE', 'INDIRECT FIRE']
export class RosterImporter {
    static async import(content) {
        if (content.trim().startsWith("{")) {
            await this._importJSON(content);
        } else {
            await this._importXML(content);
        }
    }

    static async _importXML(xml) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(xml, "application/xml");
        // print the name of the root element or error message
        const errorNode = doc.querySelector("parsererror");
        if (errorNode) {
            ui.notifications.error("Could not read file: error while parsing")
        }
        // console.log(doc)
        let folder = await Folder.create({ name: doc.getElementsByTagName("roster")[0].getAttribute('name'), type: "Actor" })
        let units = [...doc.querySelectorAll("force > selections > selection")]
        units = units.filter(s => ['model', "unit"].includes(s.getAttribute('type')))
        units.map(async selection => {
            try {
                await this._importUnit(selection, folder)
            } catch (e) {
                ui.notifications.error("error while importing \"" + (selection.querySelector("selection[type='model']") || selection).getAttribute('name') + "\" some items may be missing: see console for details")
                console.error(e)
            }
        })
    }

    static async _importUnit(xml, folder) {
        let units = xml.querySelectorAll("selection[type='model']")
        if (units.length === 0)
            units = [xml]
        for (const unitXml of units) {

            let data = {
                name: unitXml.getAttribute('name') || xml.getAttribute('name'),
                folder: folder.id,
                type: "model",
                system: {
                    stats: {}
                },
            }

            // (faction) tags
            let tags = [...xml.querySelectorAll("categories category")]
            tags = tags.map(tag => tag.getAttribute('name'))
            let factionTag = tags.filter(value => value.startsWith("Faction:")).map(s => s.slice("Faction: ".length).toUpperCase())
            factionTag = factionTag.filter(s => FACTIONS[s])
            data.system.faction = factionTag
            data.system.tags = Array.from(new Set(tags.filter(value => !value.startsWith("Faction:"))))

            let statXml = unitXml.querySelector("characteristic[name='M']") ? unitXml : xml
            //stats
            data.system.stats.move = statXml.querySelector("characteristic[name='M']").firstChild.nodeValue.replace("\"", '').replace("+", '')
            data.system.stats.toughness = statXml.querySelector("characteristic[name='T']").firstChild.nodeValue
            data.system.stats.save = statXml.querySelector("characteristic[name='SV']").firstChild.nodeValue.replace("+", '')
            data.system.stats.wounds = {
                value: statXml.querySelector("characteristic[name='W']").firstChild.nodeValue,
                max: statXml.querySelector("characteristic[name='W']").firstChild.nodeValue
            }
            data.system.stats.leadership = statXml.querySelector("characteristic[name='LD']").firstChild.nodeValue.replace("+", '')
            data.system.stats.control = statXml.querySelector("characteristic[name='OC']").firstChild.nodeValue

            //items
            let actor = await Actor.create(data)
            let rules = Array.from(xml.children).find(a => a.tagName === "rules")

            if (rules) {
                for (const rule of rules.children) {
                    await this._importItem(rule, actor)
                }
            }
            let abilities = Array.from(xml.querySelectorAll("profile[typeName='Abilities']"))
            abilities.forEach(a => this._importItem(a, actor))

            let weapons = Array.from(unitXml.children).find(a => a.tagName === "selections")
            let recursiveSelections = a => {
                if (a.firstElementChild.tagName === "selections") {
                    for (const child of a.firstChild.children) {
                        recursiveSelections(child)
                    }
                    return
                }
                this._importItem(a, actor)
            }
            for (const weapon of weapons.children) {
                recursiveSelections(weapon)
            }
        }
    }

    static async _importItem(xml, actor) {
        try {
            if (xml.tagName === "rule")
                await this._importRule(xml, actor)
            else if (xml.getAttribute('typeName') === "Abilities")
                await this._importAbility(xml, actor)
            else if (xml.tagName === "selection" && ["rules", "profiles"].includes(xml.firstElementChild.tagName))
                await this._importWeapon(xml, actor)
        }
        catch (e) {
            ui.notifications.error("error while importing \"" + actor.name + "\" some items may be missing: see console for details")
            console.error(e)
        }

    }

    static async _importRule(xml, actor) {
        let data = {
            type: "ability",
            system: {}
        }
        data.name = xml.getAttribute('name')
        try {
            data.system.description = xml.querySelector("description").firstChild.textContent

            if (data.name === "Stealth") {
                await ActiveEffect.create({
                    name: data.name,
                    changes: [{
                        key: 'system.modifiers.grants.hitroll.ranged.bonus',
                        value: -1,
                        mode: 5,
                    }]
                }, { parent: actor })
            }
            if (data.name === "Lone Operative") {
                await ActiveEffect.create({
                    name: data.name,
                    changes: [{
                        key: 'system.loneOperative',
                        value: true,
                        mode: 5,
                    }]
                }, { parent: actor })
            }

            await Item.create(data, { parent: actor })
        } catch (e) {
            ui.notifications.error("error while importing ability '" + data.name + "' on actor '" + actor.name + "', item omitted")
            console.error(e)
        }
    }

    static async _importAbility(xml, actor) {
        let data = {
            type: "ability",
            system: {}
        }
        data.name = xml.getAttribute('name')
        try {
            data.system.description = xml.querySelector("characteristic[name='Description']").firstChild.textContent
            if (data.name === "Invulnerable Save") {
                await ActiveEffect.create({
                    name: data.name,
                    changes: [{
                        key: 'system.invulnsave',
                        //NOTE make this less fragile at some point
                        value: data.system.description.match(/(\d)+/)[1],
                        mode: 5,
                    }]
                }, { parent: actor })
                return
            }
            await Item.create(data, { parent: actor })
        } catch (e) {
            ui.notifications.error("error while importing ability '" + data.name + "' on actor '" + actor.name + "', item omitted")
            console.error(e)
        }
    }

    static async _importWeapon(xml, actor) {
        for (const profile of xml.querySelectorAll("profile")) {
            if (!profile.getAttribute("typeName").endsWith("Weapons")) {
                continue
            }
            let data = {
                type: "weapon",
                system: {}
            }
            data.name = profile.getAttribute('name')
            try {
                data.system.range = profile.querySelector("characteristic[name='Range']").firstChild.nodeValue.replace("\"", '').replace("Melee", '0')
                data.system.attacks = profile.querySelector("characteristic[name='A']").firstChild.nodeValue.replace(/(?:\D|^)D(\d)/, ' 1D$1')
                data.system.skill = profile.querySelector("characteristic[name='BS'], characteristic[name='WS']").firstChild.nodeValue.replace("N/A", '0').replace("+", '')
                data.system.strength = profile.querySelector("characteristic[name='S']").firstChild.nodeValue
                data.system.ap = profile.querySelector("characteristic[name='AP']").firstChild.nodeValue
                data.system.damage = profile.querySelector("characteristic[name='D']").firstChild.nodeValue.replace(/(?:\D|^)D(\d)/, ' 1D$1')

                let tags = profile.querySelector("characteristic[name='Keywords']")?.firstChild?.nodeValue.replace(/(?:\D|^)D(\d)/, ' 1D$1').replace("+", '').split(",")
                //clean up tag list
                tags = tags.map(i => i.trim()).filter(i => i)
                if (!tags || tags[0] === "-")
                    tags = []
                data.system.tags = []
                for (const tag of tags) {
                    data.system.tags.push(await this._importWTag(tag, xml.querySelector("rules"), actor))
                }
                let item = await Item.create(data, { parent: actor })
            } catch (e) {
                ui.notifications.error("error while importing weapon '" + data.name + "' on actor '" + actor.name + "', item omitted")
                console.error(e)
            }
        }
    }

    static async _importWTag(tag, rules, actor) {
        try {
            let data = {
                type: "wtag",
                system: {}
            }
            let valueRegx = new RegExp(/(\D+)(\d+.*)?/)
            let match = tag.match(valueRegx)

            data.name = match[1].trim()
            data.system.value = match[2]?.trim()

            for (const rule of rules.children) {
                const name = rule.getAttribute('name').toUpperCase();
                if (name === data.name.toUpperCase()
                    || name === tag.toUpperCase()
                    || (name.startsWith("ANTI-") && name === data.name.slice(0, "ANTI-".length).toUpperCase())) {
                    data.system.description = rule.firstChild.textContent
                }
            }
            if (!data.system.description) {
                // console.log(tag, rules, actor)
                console.warn("Could not find description for weapon tag '" + data.name + "' on actor '" + actor.name + "', proceeding with blank description")
            }

            if (OPTIONAL_TAGS.includes(data.name.toUpperCase()))
                data.system.optional = true

            let item = await Item.create(data, { parent: actor })
            return item.id
        } catch (e) {
            ui.notifications.error("error while importing weapon tag '" + data.name + "' on actor '" + actor.name + "', tag omitted")
            console.error(e)
        }
    }

    static async fetchBaseSizes() {
        try {
            // Direct fetch from Wahapedia. Note: This may require a proxy or browser extension if CORS is enforced by the browser. 
            // In Foundry's Electron app, it often passes.
            const response = await fetch("https://corsproxy.io/?https://wahapedia.ru/wh40k10ed/Datasheets_models.csv");
            if (!response.ok) throw new Error("Failed to fetch base sizes");
            const text = await response.text();

            const lines = text.split(/\r?\n/);
            const headers = lines[0].split("|");
            const nameIndex = headers.indexOf("name");
            const sizeIndex = headers.indexOf("base_size");

            if (nameIndex === -1 || sizeIndex === -1) {
                throw new Error("Invalid CSV format: Missing 'name' or 'base_size' columns");
            }

            const baseSizes = {};
            for (let i = 1; i < lines.length; i++) {
                const cols = lines[i].split("|");
                if (cols.length <= Math.max(nameIndex, sizeIndex)) continue;

                const name = cols[nameIndex].trim().toLowerCase();
                const size = cols[sizeIndex].trim();

                if (name && size) {
                    baseSizes[name] = size;
                }
            }

            await game.settings.set(SYSTEM_ID, "baseSizes", baseSizes);
            console.log("Warhammer 40k 10th: Updated Base Sizes from Wahapedia", Object.keys(baseSizes).length);
        } catch (e) {
            console.error(e);
            ui.notifications.error("Failed to fetch base sizes: " + e.message);
        }
    }

    static getBaseSize(name) {
        const sizes = game.settings.get(SYSTEM_ID, "baseSizes");
        // Try exact match, or singular/plural variations if needed. 
        // Wahapedia names are usually singular for characters, but 'Intercessor Squad' might map to 'Intercessor'? 
        // Actually, the CSV lists 'Intercessor', 'Assault Intercessor', etc.
        // The importer uses the model name.
        let key = name.toLowerCase();
        let sizeStr = sizes[key];

        // Fallback: Remove 'Squad' or try simple heuristics involved in typical name mismatches
        // e.g. "Assault Intercessor Squad" -> "Assault Intercessor"
        if (!sizeStr && key.endsWith(" squad")) {
            sizeStr = sizes[key.replace(" squad", "")];
        }

        if (!sizeStr) return null;

        const matches = sizeStr.match(/(\d+)(?:\s*x\s*(\d+))?mm/);

        if (matches) {
            // Convert mm to inches (grid units)
            let width = parseInt(matches[1]);
            let height = matches[2] ? parseInt(matches[2]) : width;

            return {
                width: width / 25.4,
                height: height / 25.4
            };
        }
        return null;
    }

    static async _importJSON(content) {
        const json = JSON.parse(content);
        let rosterName = json.roster?.name || "Imported Roster";
        // Handle case where Salamanders.json has costLimits as an array
        // and sometimes name might be in a different spot. Use heuristic if needed.
        if (json.roster.costLimits && json.roster.costLimits[0] && json.roster.costLimits[0].value) {
            rosterName = `${rosterName} (${json.roster.costLimits[0].value} pts)`;
        }

        let folder = await Folder.create({ name: rosterName, type: "Actor" });
        let forces = json.roster.forces || [];

        for (const force of forces) {
            let selections = force.selections || [];
            for (const selection of selections) {
                // We want to skip things like "Configuration" or "Battle Size"
                // Usually units have type "unit" or "model"
                if (["unit", "model"].includes(selection.type)) {
                    await this._importJSONUnit(selection, folder);
                }
            }
        }
    }

    static async _importJSONUnit(selectionData, folder) {
        // Sometimes the top selection is a unit which contains models.
        // We need to flatten this or handle it similar to existing logic where we iterated 'selection[type="model"]'
        // If the selection itself is a model, process it.
        // If it's a unit, look for child selections that are models.
        // Or if it's a unit with just one model profile, maybe we treat it as an actor?
        // Let's create an actor for the Unit/Model level that makes sense.

        // Recursive function to find models
        let models = [];
        let findModels = (sel) => {
            if (sel.type === "model") {
                models.push(sel);
            } else if (sel.selections) {
                sel.selections.forEach(findModels);
            }
        };

        if (selectionData.type === "model") {
            models.push(selectionData);
        } else {
            // It's a unit, find models inside.
            // Wait, usually in 40k 10th lists from BS, a unit acts as the actor.
            // But if specific models have different stats, we might need multiple actors or one actor with mixed stats?
            // The existing XML importer does: let units = xml.querySelectorAll("selection[type='model']")... if empty use xml.
            // It creates ONE actor per model found, or one per unit if no models found?
            // Actually: "units.map(async selection => ... _importUnit"
            // Inside _importUnit: "let models = xml.querySelectorAll('selection[type=\'model\']')"...
            // It seems it creates an actor for EACH model found in the unit selection.
            // Let's replicate this behavior.
            findModels(selectionData);
        }

        if (models.length === 0) {
            // Fallback if no explicit 'model' type selections found, maybe the unit IS the model (e.g. single character unit)
            models.push(selectionData);
        }

        for (const modelData of models) {
            let name = modelData.name;
            // If model name implies just a generic guy in a unit (e.g. "Intercessor"), maybe we want the Unit name?
            // But existing code uses model name. Let's stick to model name.

            let data = {
                name: name,
                folder: folder.id,
                type: "model",
                system: {
                    stats: {}
                },
            }

            // Faction & Categories
            // Categories in JSON are usually under 'categories' array.
            // We need to walk up or merge categories from parent unit?
            // In the JSON provided, categories are on the Unit selection, and sometimes on Model selection.
            // Let's assume we need to collect categories from the model and its parent unit (selectionData).
            let allCategories = [];
            if (selectionData.categories) allCategories.push(...selectionData.categories);
            if (modelData !== selectionData && modelData.categories) allCategories.push(...modelData.categories);

            let tags = allCategories.map(c => c.name);
            let factionTag = tags.filter(value => value.startsWith("Faction: ")).map(s => s.slice("Faction: ".length).toUpperCase());
            factionTag = factionTag.filter(s => FACTIONS[s]);
            data.system.faction = factionTag;
            data.system.tags = Array.from(new Set(tags.filter(value => !value.startsWith("Faction:"))));

            // Stats
            // Stats are in 'profiles'. We need to find the profile of type 'Unit'
            let findProfile = (sel, typeName) => {
                if (sel.profiles) {
                    let p = sel.profiles.find(p => p.typeName === typeName);
                    if (p) return p;
                }
                if (sel.selections) {
                    for (let s of sel.selections) {
                        let p = findProfile(s, typeName);
                        if (p) return p;
                    }
                }
                return null;
            }

            // First check model, then parent unit
            let statProfile = findProfile(modelData, "Unit") || findProfile(selectionData, "Unit");

            if (statProfile) {
                let getChar = (name) => statProfile.characteristics.find(c => c.name === name)?.$text || "0";

                data.system.stats.move = getChar('M').replace("\"", '').replace("+", '');
                data.system.stats.toughness = getChar('T');
                data.system.stats.save = getChar('SV').replace("+", '');
                let w = getChar('W');
                data.system.stats.wounds = { value: w, max: w };
                data.system.stats.leadership = getChar('LD').replace("+", '');
                data.system.stats.control = getChar('OC');
            }



            // Apply Base Size
            let size = this.getBaseSize(name);
            if (size) {
                data.prototypeToken = {
                    width: size.width,
                    height: size.height
                };
            }

            let actor = await Actor.create(data);

            // Import Rules / Abilities / Weapons
            // These can be on the model, or the parent unit.
            // We should check both.

            let itemsToImport = [];

            // Helper to collect items recursively
            let collectItems = (sel) => {
                if (sel.profiles) itemsToImport.push(...sel.profiles);
                if (sel.rules) itemsToImport.push(...sel.rules);
                if (sel.selections) sel.selections.forEach(collectItems);
            };

            // Collect from unit (excluding other models if possible? No, usually rules on unit apply to all)
            // But we don't want weapons from other models.
            // The JSON structure is tricky. 
            // Unit -> Selections -> Model -> Selections -> Weapons
            // So if we process 'modelData', we get its specific weapons.
            // We also want 'abilities' from the parent Unit.

            // 1. Items from Model
            collectItems(modelData);

            // 2. Items from Parent Unit (but be careful not to include sibling models' weapons)
            // We can manually pick rules/abilities from parent
            if (selectionData !== modelData) {
                if (selectionData.profiles) itemsToImport.push(...selectionData.profiles);
                if (selectionData.rules) itemsToImport.push(...selectionData.rules);
                // We do NOT recurse into selectionData.selections because those are likely other models or upgrades handled within model
            }

            for (const item of itemsToImport) {
                await this._importJSONItem(item, actor);
            }
        }
    }

    static async _importJSONItem(itemData, actor) {
        // itemData could be a 'profile' or a 'rule' object from JSON
        // Profile has 'typeName', 'characteristics' (array)
        // Rule has 'name', 'description'

        try {
            // Is it a Rule?
            if (itemData.description && !itemData.typeName) {
                // It's a rule
                let data = {
                    name: itemData.name,
                    type: "ability",
                    system: {
                        description: itemData.description
                    }
                };
                if (data.name === "Stealth") {
                    await ActiveEffect.create({
                        name: data.name,
                        changes: [{ key: 'system.modifiers.grants.hitroll.ranged.bonus', value: -1, mode: 5 }]
                    }, { parent: actor });
                }
                if (data.name === "Lone Operative") {
                    await ActiveEffect.create({
                        name: data.name,
                        changes: [{ key: 'system.loneOperative', value: true, mode: 5 }]
                    }, { parent: actor });
                }
                await Item.create(data, { parent: actor });
                return;
            }

            // Is it a Profile?
            if (itemData.typeName) {
                if (itemData.typeName === "Abilities") {
                    let desc = itemData.characteristics.find(c => c.name === "Description")?.$text || "";
                    let data = {
                        name: itemData.name,
                        type: "ability",
                        system: { description: desc }
                    };

                    if (data.name === "Invulnerable Save") {
                        await ActiveEffect.create({
                            name: data.name,
                            changes: [{
                                key: 'system.invulnsave',
                                value: desc.match(/(\d)+/)[1],
                                mode: 5,
                            }]
                        }, { parent: actor })
                        return
                    }

                    await Item.create(data, { parent: actor });
                }
                else if (itemData.typeName.endsWith("Weapons")) {
                    let data = {
                        name: itemData.name,
                        type: "weapon",
                        system: {}
                    };

                    let getChar = (n) => itemData.characteristics.find(c => c.name === n)?.$text || "0";

                    data.system.range = getChar('Range').replace("\"", '').replace("Melee", '0');
                    data.system.attacks = getChar('A').replace(/(?:\D|^)D(\d)/, ' 1D$1');
                    data.system.skill = getChar('BS') === "N/A" ? getChar('WS').replace("+", '') : getChar('BS').replace("+", '');
                    if (data.system.skill === "0") data.system.skill = getChar('WS').replace("+", ''); // Fallback if BS was N/A but WS exists or vice versa check logic

                    // Actually looking at XML logic:
                    // querySelector("characteristic[name='BS'], characteristic[name='WS']")
                    // It picks the first one found ? 
                    // In JSON we have implicit names.
                    // Ranged has BS, Melee has WS.
                    // Let's rely on typeName or just check both.
                    let bs = itemData.characteristics.find(c => c.name === "BS");
                    let ws = itemData.characteristics.find(c => c.name === "WS");
                    let val = (bs && bs.$text !== "N/A") ? bs.$text : (ws ? ws.$text : "0");
                    data.system.skill = val.replace("+", '');

                    data.system.strength = getChar('S');
                    data.system.ap = getChar('AP');
                    data.system.damage = getChar('D').replace(/(?:\D|^)D(\d)/, ' 1D$1');

                    let tagsStr = getChar('Keywords');
                    let tags = tagsStr.replace(/(?:\D|^)D(\d)/, ' 1D$1').replace("+", '').split(",");
                    tags = tags.map(i => i.trim()).filter(i => i && i !== "-");

                    data.system.tags = [];

                    // We need rules for tags to find descriptions.
                    // This is harder in JSON. The 'rules' are typically separate logic objects.
                    // But often the JSON dump from BS includes them inline or referenced?
                    // In the provided JSON, rules are under 'rules' array in selections.
                    // But we only have 'itemData' here. We might need access to global rules or pass them down?
                    // For now, let's just create tags without descriptions or simple ones.
                    // Wait, `_importWTag` in XML uses `xml.querySelector("rules")`. 
                    // For JSON, do we have rules nearby?
                    // We processed rules separately. 
                    // Let's just add the Item wtags.

                    for (const tag of tags) {
                        // For now we skip description lookup as it requires traversing the whole JSON for rule definitions by ID usually
                        // Or they are attached to the selection.
                        let tagData = {
                            name: tag,
                            type: "wtag",
                            system: { value: "" } // Parse value if needed (e.g. Anti-Vehicle 4+)
                        };
                        let valueRegx = new RegExp(/(\D+)(\d+.*)?/)
                        let match = tag.match(valueRegx)
                        if (match) {
                            tagData.name = match[1].trim();
                            tagData.system.value = match[2]?.trim();
                            if (OPTIONAL_TAGS.includes(tagData.name.toUpperCase())) tagData.system.optional = true;
                        }

                        // Try to find description? 
                        // For now, leave empty.
                        let tItem = await Item.create(tagData, { parent: actor });
                        data.system.tags.push(tItem.id);
                    }

                    await Item.create(data, { parent: actor });
                }
            }

        } catch (e) {
            console.error("Error importing JSON item", e);
        }
    }

    static async updateFolderBaseSizes(folder) {
        try {
            // 1. Ensure we have base sizes
            let sizes = game.settings.get(SYSTEM_ID, "baseSizes");
            if (!sizes || Object.keys(sizes).length === 0) {
                ui.notifications.info("Fetching base sizes from Wahapedia...");
                await this.fetchBaseSizes();
            }

            // 2. Get Actors in folder
            const actors = folder.contents;
            if (!actors || actors.length === 0) {
                ui.notifications.warn("No actors found in folder " + folder.name);
                return;
            }

            let updatedCount = 0;
            for (const actor of actors) {
                const size = this.getBaseSize(actor.name);
                if (size) {
                    await actor.update({
                        prototypeToken: {
                            width: size.width,
                            height: size.height
                        }
                    });
                    console.log(`Warhammer 40k | Updated ${actor.name} to ${size.width}x${size.height}`);
                    updatedCount++;
                }
            }

            ui.notifications.info(`Updated base sizes for ${updatedCount} / ${actors.length} actors in "${folder.name}".`);

        } catch (e) {
            console.error("Error updating folder base sizes:", e);
            ui.notifications.error("Failed to update base sizes: " + e.message);
        }
    }

    static async updateAllBaseSizes() {
        try {
            // 1. Ensure we have base sizes
            let sizes = game.settings.get(SYSTEM_ID, "baseSizes");
            if (!sizes || Object.keys(sizes).length === 0) {
                ui.notifications.info("Fetching base sizes from Wahapedia...");
                await this.fetchBaseSizes();
            }

            // 2. Get All Actors
            const actors = game.actors;
            if (!actors || actors.size === 0) {
                ui.notifications.warn("No actors found.");
                return;
            }

            let updatedCount = 0;
            for (const actor of actors) {
                const size = this.getBaseSize(actor.name);
                if (size) {
                    await actor.update({
                        prototypeToken: {
                            width: size.width,
                            height: size.height
                        }
                    });
                    console.log(`Warhammer 40k | Updated ${actor.name} to ${size.width}x${size.height}`);
                    updatedCount++;
                }
            }

            ui.notifications.info(`Updated base sizes for ${updatedCount} / ${actors.size} actors.`);

        } catch (e) {
            console.error("Error updating all base sizes:", e);
            ui.notifications.error("Failed to update base sizes: " + e.message);
        }
    }
}