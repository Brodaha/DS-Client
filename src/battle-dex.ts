/**
 * Pokemon Showdown Dex
 *
 * Roughly equivalent to sim/dex.js in a Pokemon Showdown server, but
 * designed for use in browsers rather than in Node.
 *
 * This is a generic utility library for Pokemon Showdown code: any
 * code shared between the replay viewer and the client usually ends up
 * here.
 *
 * Licensing note: PS's client has complicated licensing:
 * - The client as a whole is AGPLv3
 * - The battle replay/animation engine (battle-*.ts) by itself is MIT
 *
 * @author Guangcong Luo <guangcongluo@gmail.com>
 * @license MIT
 */

if (!Array.prototype.indexOf) {
	Array.prototype.indexOf = function indexOf(searchElement, fromIndex) {
		for (let i = (fromIndex || 0); i < this.length; i++) {
			if (this[i] === searchElement) return i;
		}
		return -1;
	};
}
if (!Array.prototype.includes) {
	Array.prototype.includes = function includes(thing) {
		return this.indexOf(thing) !== -1;
	};
}
if (!Array.isArray) {
	Array.isArray = function isArray(thing): thing is any[] {
		return Object.prototype.toString.call(thing) === '[object Array]';
	};
}
if (!String.prototype.includes) {
	String.prototype.includes = function includes(thing) {
		return this.indexOf(thing) !== -1;
	};
}
if (!String.prototype.startsWith) {
	String.prototype.startsWith = function startsWith(thing) {
		return this.slice(0, thing.length) === thing;
	};
}
if (!String.prototype.endsWith) {
	String.prototype.endsWith = function endsWith(thing) {
		return this.slice(-thing.length) === thing;
	};
}
if (!String.prototype.trim) {
	String.prototype.trim = function trim() {
		return this.replace(/^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$/g, '');
	};
}
if (!Object.assign) {
	Object.assign = function assign(thing: any, rest: any) {
		for (let i = 1; i < arguments.length; i++) {
			let source = arguments[i];
			for (let k in source) {
				thing[k] = source[k];
			}
		}
		return thing;
	};
}
// if (!Object.create) {
// 	Object.create = function (proto) {
// 		function F() {}
// 		F.prototype = proto;
// 		return new F();
// 	};
// }

if (!window.exports) window.exports = window;

if (window.soundManager) {
	soundManager.setup({url: 'https://play.pokemonshowdown.com/swf/'});
	if (window.Replays) soundManager.onready(window.Replays.soundReady);
	soundManager.onready(() => {
		soundManager.createSound({
			id: 'notif',
			url: 'https://play.pokemonshowdown.com/audio/notification.wav',
		});
	});
}

// @ts-ignore
window.nodewebkit = !!(typeof process !== 'undefined' && process.versions && process.versions['node-webkit']);

function getString(str: any) {
	if (typeof str === 'string' || typeof str === 'number') return '' + str;
	return '';
}

function toId(text: any) {
	if (text && text.id) {
		text = text.id;
	} else if (text && text.userid) {
		text = text.userid;
	}
	if (typeof text !== 'string' && typeof text !== 'number') return '' as ID;
	return ('' + text).toLowerCase().replace(/[^a-z0-9]+/g, '') as ID;
}

function toUserid(text: any) {
	return toId(text);
}

/**
 * Sanitize a room ID by removing anything that isn't alphanumeric or `-`.
 * Shouldn't actually do anything except against malicious input.
 */
function toRoomid(roomid: string) {
	return roomid.replace(/[^a-zA-Z0-9-]+/g, '').toLowerCase();
}

function toName(name: any) {
	if (typeof name !== 'string' && typeof name !== 'number') return '';
	name = ('' + name).replace(/[\|\s\[\]\,\u202e]+/g, ' ').trim();
	if (name.length > 18) name = name.substr(0, 18).trim();

	// remove zalgo
	name = name.replace(/[\u0300-\u036f\u0483-\u0489\u0610-\u0615\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06ED\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]{3,}/g, '');
	name = name.replace(/[\u239b-\u23b9]/g, '');

	return name;
}

interface SpriteData {
	w: number;
	h: number;
	y?: number;
	url?: string;
	rawHTML?: string;
	pixelated?: boolean;
	isBackSprite?: boolean;
	cryurl?: string;
	shiny?: boolean;
}

const Dex = {

	resourcePrefix: (() => {
		let prefix = '';
		if (!window.document || !document.location || document.location.protocol !== 'http:') prefix = 'https:';
		return prefix + '//play.pokemonshowdown.com/';
	})(),

	fxPrefix: (() => {
		if (window.document && document.location && document.location.protocol === 'file:') {
			if (window.Replays) return 'https://play.pokemonshowdown.com/fx/';
			return 'fx/';
		}
		return '//play.pokemonshowdown.com/fx/';
	})(),

	/*
	 * DEPRECATED: use PSObservable
	 *
	 * Load trackers are loosely based on Promises, but very simplified.
	 * Trackers are made with: let tracker = Dex.makeLoadTracker();
	 * Pass callbacks like so: tracker(callback)
	 * When tracker.load() is called, all callbacks are run.
	 * If tracker.load() has already been called, tracker(callback) will
	 * call the callback instantly.
	 */
	makeLoadTracker<T = any, C = void>() {
		type LoadTracker = ((callback: (this: C, value: T) => void, context: C) => LoadTracker) & {
			isLoaded: boolean,
			value: T | undefined,
			load: (value: T) => void,
			unload: () => void,
			callbacks: [(value: T) => void, C][],
		};
		let tracker: LoadTracker = ((callback, context) => {
			if (tracker.isLoaded) {
				callback.call(context, tracker.value!);
			} else {
				tracker.callbacks.push([callback, context]);
			}
			return tracker;
		}) as LoadTracker;
		tracker.callbacks = [];
		tracker.value = undefined;
		tracker.isLoaded = false;
		tracker.load = (value: T) => {
			if (tracker.isLoaded) return;
			tracker.isLoaded = true;
			tracker.value = value;
			for (const [callback, context] of tracker.callbacks) {
				callback.call(context, value);
			}
		};
		tracker.unload = () => {
			if (!tracker.isLoaded) return;
			tracker.isLoaded = false;
		};
		return tracker;
	},

	resolveAvatar(avatar: string | number): string {
		let avatarnum = Number(avatar);
		if (!isNaN(avatarnum)) {
			// default avatars
			return Dex.resourcePrefix + 'sprites/trainers/' + avatarnum + '.png';
		}
		avatar = '' + avatar;
		if (avatar.charAt(0) === '#') {
			return Dex.resourcePrefix + 'sprites/trainers/' + toId(avatar.substr(1)) + '.png';
		}
		if (window.Config && Config.server && Config.server.registered) {
			// custom avatar served by the server
			let protocol = (Config.server.port === 443) ? 'https' : 'http';
			return protocol + '://' + Config.server.host + ':' + Config.server.port +
				'/avatars/' + encodeURIComponent(avatar).replace(/\%3F/g, '?');
		}
		// just pick a random avatar
		let sprites = [1, 2, 101, 102, 169, 170];
		return Dex.resolveAvatar(sprites[Math.floor(Math.random() * sprites.length)]);
	},

	sanitizeName(name: string) {
		return ('' + name).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
	},

	prefs(prop: string, value?: any, save?: boolean) {
		// @ts-ignore
		if (window.Storage && Storage.prefs) return Storage.prefs(prop, value, save);
		return undefined;
	},

	getShortName(name: string) {
		let shortName = name.replace(/[^A-Za-z0-9]+$/, '');
		if (shortName.indexOf('(') >= 0) {
			shortName += name.slice(shortName.length).replace(/[^\(\)]+/g, '').replace(/\(\)/g, '');
		}
		return shortName;
	},

	getEffect(effect: any): Effect {
		if (!effect || typeof effect === 'string') {
			let name = (effect || '').trim();
			if (name.substr(0, 5) === 'item:') {
				return Dex.getItem(name.substr(5));
			} else if (name.substr(0, 8) === 'ability:') {
				return Dex.getAbility(name.substr(8));
			} else if (name.substr(0, 5) === 'move:') {
				return Dex.getMove(name.substr(5));
			}
			let id = toId(name);
			effect = {};
			if (id && window.BattleStatuses && BattleStatuses[id]) {
				effect = BattleStatuses[id];
				effect.exists = true;
			} else if (id && window.BattleMovedex && BattleMovedex[id] && BattleMovedex[id].effect) {
				effect = BattleMovedex[id].effect;
				effect.exists = true;
			} else if (id && window.BattleAbilities && BattleAbilities[id] && BattleAbilities[id].effect) {
				effect = BattleAbilities[id].effect;
				effect.exists = true;
			} else if (id && window.BattleItems && BattleItems[id] && BattleItems[id].effect) {
				effect = BattleItems[id].effect;
				effect.exists = true;
			} else if (id === 'recoil') {
				effect = {
					effectType: 'Recoil',
				};
				effect.exists = true;
			} else if (id === 'drain') {
				effect = {
					effectType: 'Drain',
				};
				effect.exists = true;
			}
			if (!effect.id) effect.id = id;
			if (!effect.name) effect.name = Dex.sanitizeName(name);
			if (!effect.category) effect.category = 'Effect';
			if (!effect.effectType) effect.effectType = 'Effect';
		}
		return effect;
	},

	getMove(move: any): Move {
		if (!move || typeof move === 'string') {
			let name = (move || '').trim();
			let id = toId(name);
			move = (window.BattleMovedex && window.BattleMovedex[id]) || {};
			if (move.name) move.exists = true;

			if (!move.exists && id.substr(0, 11) === 'hiddenpower' && id.length > 11) {
				let matches = /([a-z]*)([0-9]*)/.exec(id)!;
				move = (window.BattleMovedex && window.BattleMovedex[matches[1]]) || {};
				move = {...move};
				move.basePower = matches[2];
			}
			if (!move.exists && id.substr(0, 6) === 'return' && id.length > 6) {
				move = (window.BattleMovedex && window.BattleMovedex['return']) || {};
				move = {...move};
				move.basePower = id.slice(6);
			}
			if (!move.exists && id.substr(0, 11) === 'frustration' && id.length > 11) {
				move = (window.BattleMovedex && window.BattleMovedex['frustration']) || {};
				move = {...move};
				move.basePower = id.slice(11);
			}

			if (!move.id) move.id = id;
			if (!move.name) move.name = Dex.sanitizeName(name);

			if (!move.critRatio) move.critRatio = 1;
			if (!move.baseType) move.baseType = move.type;
			if (!move.effectType) move.effectType = 'Move';
			if (!move.secondaries && move.secondary) move.secondaries = [move.secondary];
			if (!move.flags) move.flags = {};
			if (!move.gen) {
				if (move.num >= 560) {
					move.gen = 6;
				} else if (move.num >= 468) {
					move.gen = 5;
				} else if (move.num >= 355) {
					move.gen = 4;
				} else if (move.num >= 252) {
					move.gen = 3;
				} else if (move.num >= 166) {
					move.gen = 2;
				} else if (move.num >= 1) {
					move.gen = 1;
				} else {
					move.gen = 0;
				}
			}
		}
		return move;
	},

	getCategory(move: Move, gen: number, type?: string) {
		if (gen <= 3 && move.category !== 'Status') {
			return [
				'Fire', 'Water', 'Grass', 'Electric', 'Ice', 'Psychic', 'Dark', 'Dragon',
			].includes(type || move.type) ? 'Special' : 'Physical';
		}
		return move.category;
	},

	getItem(item: any): Item {
		if (!item || typeof item === 'string') {
			let name = (item || '').trim();
			let id = toId(name);
			item = (window.BattleItems && window.BattleItems[id]) || {};
			if (item.name) item.exists = true;
			if (!item.id) item.id = id;
			if (!item.name) item.name = Dex.sanitizeName(name);
			if (!item.category) item.category = 'Effect';
			if (!item.effectType) item.effectType = 'Item';
			if (!item.gen) {
				if (item.num >= 577) {
					item.gen = 6;
				} else if (item.num >= 537) {
					item.gen = 5;
				} else if (item.num >= 377) {
					item.gen = 4;
				} else {
					item.gen = 3;
				}
			}
		}
		return item;
	},

	getAbility(ability: any): Ability {
		if (!ability || typeof ability === 'string') {
			let name = (ability || '').trim();
			let id = toId(name);
			ability = (window.BattleAbilities && window.BattleAbilities[id]) || {};
			if (ability.name) ability.exists = true;
			if (!ability.id) ability.id = id;
			if (!ability.name) ability.name = Dex.sanitizeName(name);
			if (!ability.category) ability.category = 'Effect';
			if (!ability.effectType) ability.effectType = 'Ability';
			if (!ability.gen) {
				if (ability.num >= 165) {
					ability.gen = 6;
				} else if (ability.num >= 124) {
					ability.gen = 5;
				} else if (ability.num >= 77) {
					ability.gen = 4;
				} else if (ability.num >= 1) {
					ability.gen = 3;
				} else {
					ability.gen = 0;
				}
			}
		}
		return ability;
	},

	getTemplate(template: any): Template {
		if (!template || typeof template === 'string') {
			let name = template;
			let id = toId(name);
			let speciesid = id;
			if (window.BattleAliases && BattleAliases[id]) {
				name = BattleAliases[id];
				id = toId(name);
			}
			if (!id) name = '';
			if (!window.BattlePokedex) window.BattlePokedex = {};
			if (!window.BattlePokedex[id]) {
				template = window.BattlePokedex[id] = {};
				for (const baseid of baseSpeciesChart) {
					if (id.length > baseid.length && id.substr(0, baseid.length) === baseid) {
						template.baseSpecies = baseid;
						template.forme = id.substr(baseid.length);
					}
				}
				if (id !== 'yanmega' && id.slice(-4) === 'mega') {
					template.baseSpecies = id.slice(0, -4);
					template.forme = id.slice(-4);
				} else if (id.slice(-6) === 'primal') {
					template.baseSpecies = id.slice(0, -6);
					template.forme = id.slice(-6);
				} else if (id.slice(-5) === 'alola') {
					template.baseSpecies = id.slice(0, -5);
					template.forme = id.slice(-5);
				}
				template.exists = false;
			}
			template = window.BattlePokedex[id];
			if (template.species) name = template.species;
			if (template.exists === undefined) template.exists = true;
			if (!template.id) template.id = id;
			if (!template.name) template.name = name = Dex.sanitizeName(name);
			if (!template.speciesid) template.speciesid = id;
			if (!template.species) template.species = name;
			if (!template.baseSpecies) template.baseSpecies = name;
			if (!template.forme) template.forme = '';
			if (!template.formeLetter) template.formeLetter = '';
			if (!template.formeid) {
				let formeid = '';
				if (template.baseSpecies !== name) {
					formeid = '-' + toId(template.forme);
				}
				template.formeid = formeid;
			}
			if (!template.spriteid) template.spriteid = toId(template.baseSpecies) + template.formeid;
			if (!template.effectType) template.effectType = 'Template';
			if (!template.gen) {
				if (template.forme && ['-mega', '-megax', '-megay'].includes(template.formeid)) {
					template.gen = 6;
					template.isMega = true;
					template.battleOnly = true;
				} else if (template.formeid === '-primal') {
					template.gen = 6;
					template.isPrimal = true;
					template.battleOnly = true;
				} else if (template.formeid.slice(-5) === 'totem') {
					template.gen = 7;
					template.isTotem = true;
				} else if (template.formeid === '-alola') {
					template.gen = 7;
				} else if (template.num >= 722) {
					template.gen = 7;
				} else if (template.num >= 650) {
					template.gen = 6;
				} else if (template.num >= 494) {
					template.gen = 5;
				} else if (template.num >= 387) {
					template.gen = 4;
				} else if (template.num >= 252) {
					template.gen = 3;
				} else if (template.num >= 152) {
					template.gen = 2;
				} else if (template.num >= 1) {
					template.gen = 1;
				} else {
					template.gen = 0;
				}
			}
			if (template.otherForms && template.otherForms.indexOf(speciesid) >= 0) {
				if (!window.BattlePokedexAltForms) window.BattlePokedexAltForms = {};
				if (!window.BattlePokedexAltForms[speciesid]) {
					template = window.BattlePokedexAltForms[speciesid] = {...template};
					let form = speciesid.slice(template.baseSpecies.length);
					let formid = '-' + form;
					form = form[0].toUpperCase() + form.slice(1);
					template.form = form;
					template.species = template.baseSpecies + (form ? '-' + form : '');
					template.speciesid = toId(template.species);
					template.spriteid = toId(template.baseSpecies) + formid;
				}
				template = window.BattlePokedexAltForms[speciesid];
			}
			if (template.spriteid.slice(-5) === 'totem') template.spriteid = template.spriteid.slice(0, -5);
			if (template.spriteid.slice(-1) === '-') template.spriteid = template.spriteid.slice(0, -1);
		}
		return template;
	},

	getType(type: any): Effect {
		if (!type || typeof type === 'string') {
			let id = toId(type) as string;
			id = id.substr(0, 1).toUpperCase() + id.substr(1);
			type = (window.BattleTypeChart && window.BattleTypeChart[id]) || {};
			if (type.damageTaken) type.exists = true;
			if (!type.id) type.id = id;
			if (!type.name) type.name = id;
			if (!type.effectType) {
				type.effectType = 'Type';
			}
		}
		return type;
	},

	getAbilitiesFor(template: any, gen = 7): {[id: string]: string} {
		template = this.getTemplate(template);
		if (gen < 3 || !template.abilities) return {};
		const id = template.id;
		const templAbilities = template.abilities;
		const table = (gen >= 7 ? null : window.BattleTeambuilderTable['gen' + gen]);
		if (!table) return {...templAbilities};
		const abilities: {[id: string]: string} = {};

		if (table.overrideAbility && id in table.overrideAbility) {
			abilities['0'] = table.overrideAbility[id];
		} else {
			abilities['0'] = templAbilities['0'];
		}
		const removeSecondAbility = table.removeSecondAbility && id in table.removeSecondAbility;
		if (!removeSecondAbility && templAbilities['1']) {
			abilities['1'] = templAbilities['1'];
		}
		if (gen >= 5 && templAbilities['H']) abilities['H'] = templAbilities['H'];
		if (gen >= 7 && templAbilities['S']) abilities['S'] = templAbilities['S'];

		return abilities;
	},

	hasAbility(template: any, ability: string, gen = 7) {
		const abilities = this.getAbilitiesFor(template, gen);
		for (const i in abilities) {
			if (ability === abilities[i]) return true;
		}
		return false;
	},

	loadedSpriteData: {xy: 1, bw: 0},
	loadSpriteData(gen: 'xy' | 'bw') {
		if (this.loadedSpriteData[gen]) return;
		this.loadedSpriteData[gen] = 1;

		let path = $('script[src*="pokedex-mini.js"]').attr('src') || '';
		let qs = '?' + (path.split('?')[1] || '');
		path = (path.match(/.+?(?=data\/pokedex-mini\.js)/) || [])[0] || '';

		let el = document.createElement('script');
		el.src = path + 'data/pokedex-mini-bw.js' + qs;
		document.getElementsByTagName('body')[0].appendChild(el);
	},
	getSpriteData(pokemon: Pokemon | Template | string, siden: number, options: {
		gen?: number, shiny?: boolean, gender?: GenderName, afd?: boolean, noScale?: boolean, digi?: boolean,
	} = {gen: 6}) {
		if (!options.gen) options.gen = 6;
		if (pokemon instanceof Pokemon) {
			if (pokemon.volatiles.transform) {
				options.shiny = pokemon.volatiles.transform[2];
				options.gender = pokemon.volatiles.transform[3];
			} else {
				options.shiny = pokemon.shiny;
				options.gender = pokemon.gender;
			}
			pokemon = pokemon.getSpecies();
		}
		const template = Dex.getTemplate(pokemon);
		let spriteData = {
			w: 96,
			h: 96,
			y: 0,
			url: Dex.resourcePrefix + 'sprites/',
			pixelated: true,
			isBackSprite: false,
			cryurl: '',
			shiny: options.shiny,
		};
		let name = template.spriteid;
		let dir;
		let facing;
		if (siden) {
			dir = '';
			facing = 'front';
		} else {
			spriteData.isBackSprite = true;
			dir = '-back';
			facing = 'back';
		}

		// Decide what gen sprites to use.
		let fieldGenNum = options.gen;
		if (Dex.prefs('nopastgens')) fieldGenNum = 6;
		if (Dex.prefs('bwgfx') && fieldGenNum >= 6) fieldGenNum = 5;
		let genNum = Math.max(fieldGenNum, Math.min(template.gen, 5));
		let gen = ['', 'rby', 'gsc', 'rse', 'dpp', 'bw', 'xy', 'xy'][genNum];

		let animationData = null;
		let miscData = null;
		let speciesid = template.speciesid;
		if (template.isTotem) speciesid = toId(name);
		if (gen === 'xy' && window.BattlePokemonSprites) {
			animationData = BattlePokemonSprites[speciesid];
		}
		if (gen === 'bw' && window.BattlePokemonSpritesBW) {
			animationData = BattlePokemonSpritesBW[speciesid];
		}
		if (window.BattlePokemonSprites) miscData = BattlePokemonSprites[speciesid];
		if (!miscData && window.BattlePokemonSpritesBW) miscData = BattlePokemonSpritesBW[speciesid];
		if (!animationData) animationData = {};
		if (!miscData) miscData = {};

		if (miscData.num > 0) {
			let baseSpeciesid = toId(template.baseSpecies);
			spriteData.cryurl = 'audio/cries/' + baseSpeciesid;
			let formeid = template.formeid;
			if (template.isMega || formeid && (
				formeid === '-sky' ||
				formeid === '-therian' ||
				formeid === '-primal' ||
				formeid === '-eternal' ||
				baseSpeciesid === 'kyurem' ||
				baseSpeciesid === 'necrozma' ||
				formeid === '-super' ||
				formeid === '-unbound' ||
				formeid === '-midnight' ||
				formeid === '-school' ||
				baseSpeciesid === 'oricorio' ||
				baseSpeciesid === 'zygarde'
			)) {
				spriteData.cryurl += formeid;
			}
			spriteData.cryurl += (window.nodewebkit ? '.ogg' : '.mp3');
		}

		if (options.shiny && options.gen > 1) dir += '-shiny';

		// April Fool's 2014
		if (window.Config && Config.server && Config.server.afd || options.afd) {
			dir = 'afd' + dir;
			spriteData.url += dir + '/' + name + '.png';
			return spriteData;
		}

		// Digimon sprites
		if (options.digi) {
			spriteData.cryurl = 'sprites/digimon/audio/' + toId(template.baseSpecies);
			spriteData.cryurl += (window.nodewebkit ? '.ogg' : '.mp3');
			dir = 'digimon/sprites/digimon';

			if (!Dex.prefs('noanim') && !Dex.prefs('nogif')) {
				dir = dir + 'ani';
				if (facing.charAt(0) === 'b') dir += '-back';
				spriteData.url += dir + '/' + name + '.gif';
			} else {
				if (facing.charAt(0) === 'b') dir += '-back';
				spriteData.url += dir + '/' + name + '.png';
			}
			spriteData.w = 56;
			spriteData.h = 56;
			return spriteData;
		}

		if (animationData[facing + 'f'] && options.gender === 'F') facing += 'f';
		let allowAnim = !Dex.prefs('noanim') && !Dex.prefs('nogif');
		if (allowAnim && genNum >= 6) spriteData.pixelated = false;
		if (allowAnim && animationData[facing] && genNum >= 5) {
			if (facing.slice(-1) === 'f') name += '-f';
			dir = gen + 'ani' + dir;

			spriteData.w = animationData[facing].w;
			spriteData.h = animationData[facing].h;
			spriteData.url += dir + '/' + name + '.gif';
		} else {
			// There is no entry or enough data in pokedex-mini.js
			// Handle these in case-by-case basis; either using BW sprites or matching the played gen.
			if (gen === 'xy') gen = 'bw';
			dir = gen + dir;

			// Gender differences don't exist prior to Gen 4,
			// so there are no sprites for it
			if (genNum >= 4 && miscData['frontf'] && options.gender === 'F') {
				name += '-f';
			}

			spriteData.url += dir + '/' + name + '.png';
		}

		if (!options.noScale) {
			if (fieldGenNum > 5) {
				// no scaling
			} else if (!spriteData.isBackSprite || fieldGenNum === 5) {
				spriteData.w *= 2;
				spriteData.h *= 2;
				spriteData.y += -16;
			} else {
				// backsprites are multiplied 1.5x by the 3D engine
				spriteData.w *= 2 / 1.5;
				spriteData.h *= 2 / 1.5;
				spriteData.y += -11;
			}
			if (fieldGenNum === 5) spriteData.y = -35;
			if (fieldGenNum === 5 && spriteData.isBackSprite) spriteData.y += 40;
			if (genNum <= 2) spriteData.y += 2;
		}
		if (template.isTotem && !options.noScale) {
			spriteData.w *= 1.5;
			spriteData.h *= 1.5;
			spriteData.y += -11;
		}

		return spriteData;
	},

	getPokemonIcon(pokemon: any, facingLeft?: boolean, digi?: boolean) {
		let num = 0;
		let pokeballSheet = 'sprites/smicons-pokeball-sheet.png';

		if (digi) {
			pokeballSheet = 'sprites/digimon/sprites/xyicons-pokeball-sheet.png';
		}

		if (pokemon === 'pokeball') {
			return 'background:transparent url(' + Dex.resourcePrefix + pokeballSheet + ') no-repeat scroll -0px 4px';
 		} else if (pokemon === 'pokeball-statused') {
			return 'background:transparent url(' + Dex.resourcePrefix + pokeballSheet + ') no-repeat scroll -40px 4px';
		} else if (pokemon === 'pokeball-fainted') {
			return 'background:transparent url(' + Dex.resourcePrefix + pokeballSheet + ') no-repeat scroll -80px 4px;opacity:.4;filter:contrast(0)';
		} else if (pokemon === 'pokeball-none') {
			return 'background:transparent url(' + Dex.resourcePrefix + pokeballSheet + ') no-repeat scroll -80px 4px';
		}
		let id = toId(pokemon);
		if (pokemon && pokemon.species) id = toId(pokemon.species);
		if (pokemon && pokemon.volatiles && pokemon.volatiles.formechange && !pokemon.volatiles.transform) {
			id = toId(pokemon.volatiles.formechange[2]);
		}
		if (pokemon && pokemon.num !== undefined) num = pokemon.num;
		else if (window.BattlePokemonSprites && BattlePokemonSprites[id] && BattlePokemonSprites[id].num) num = BattlePokemonSprites[id].num;
		else if (window.BattlePokedex && window.BattlePokedex[id] && BattlePokedex[id].num) num = BattlePokedex[id].num;
		if (num < 0) num = 0;
		if (num > 809) num = 0;
		let altNums: {[id: string]: number} = {
			egg: 816 + 1,
			pikachubelle: 816 + 2,
			pikachulibre: 816 + 3,
			pikachuphd: 816 + 4,
			pikachupopstar: 816 + 5,
			pikachurockstar: 816 + 6,
			pikachucosplay: 816 + 7,
			// unown gap
			castformrainy: 816 + 35,
			castformsnowy: 816 + 36,
			castformsunny: 816 + 37,
			deoxysattack: 816 + 38,
			deoxysdefense: 816 + 39,
			deoxysspeed: 816 + 40,
			burmysandy: 816 + 41,
			burmytrash: 816 + 42,
			wormadamsandy: 816 + 43,
			wormadamtrash: 816 + 44,
			cherrimsunshine: 816 + 45,
			shelloseast: 816 + 46,
			gastrodoneast: 816 + 47,
			rotomfan: 816 + 48,
			rotomfrost: 816 + 49,
			rotomheat: 816 + 50,
			rotommow: 816 + 51,
			rotomwash: 816 + 52,
			giratinaorigin: 816 + 53,
			shayminsky: 816 + 54,
			unfezantf: 816 + 55,
			basculinbluestriped: 816 + 56,
			darmanitanzen: 816 + 57,
			deerlingautumn: 816 + 58,
			deerlingsummer: 816 + 59,
			deerlingwinter: 816 + 60,
			sawsbuckautumn: 816 + 61,
			sawsbucksummer: 816 + 62,
			sawsbuckwinter: 816 + 63,
			frillishf: 816 + 64,
			jellicentf: 816 + 65,
			tornadustherian: 816 + 66,
			thundurustherian: 816 + 67,
			landorustherian: 816 + 68,
			kyuremblack: 816 + 69,
			kyuremwhite: 816 + 70,
			keldeoresolute: 816 + 71,
			meloettapirouette: 816 + 72,
			vivillonarchipelago: 816 + 73,
			vivilloncontinental: 816 + 74,
			vivillonelegant: 816 + 75,
			vivillonfancy: 816 + 76,
			vivillongarden: 816 + 77,
			vivillonhighplains: 816 + 78,
			vivillonicysnow: 816 + 79,
			vivillonjungle: 816 + 80,
			vivillonmarine: 816 + 81,
			vivillonmodern: 816 + 82,
			vivillonmonsoon: 816 + 83,
			vivillonocean: 816 + 84,
			vivillonpokeball: 816 + 85,
			vivillonpolar: 816 + 86,
			vivillonriver: 816 + 87,
			vivillonsandstorm: 816 + 88,
			vivillonsavanna: 816 + 89,
			vivillonsun: 816 + 90,
			vivillontundra: 816 + 91,
			pyroarf: 816 + 92,
			flabebeblue: 816 + 93,
			flabebeorange: 816 + 94,
			flabebewhite: 816 + 95,
			flabebeyellow: 816 + 96,
			floetteblue: 816 + 97,
			floetteeternal: 816 + 98,
			floetteorange: 816 + 99,
			floettewhite: 816 + 100,
			floetteyellow: 816 + 101,
			florgesblue: 816 + 102,
			florgesorange: 816 + 103,
			florgeswhite: 816 + 104,
			florgesyellow: 816 + 105,
			furfroudandy: 816 + 106,
			furfroudebutante: 816 + 107,
			furfroudiamond: 816 + 108,
			furfrouheart: 816 + 109,
			furfroukabuki: 816 + 110,
			furfroulareine: 816 + 111,
			furfroumatron: 816 + 112,
			furfroupharaoh: 816 + 113,
			furfroustar: 816 + 114,
			meowsticf: 816 + 115,
			aegislashblade: 816 + 116,
			hoopaunbound: 816 + 118,
			rattataalola: 816 + 119,
			raticatealola: 816 + 120,
			raichualola: 816 + 121,
			sandshrewalola: 816 + 122,
			sandslashalola: 816 + 123,
			vulpixalola: 816 + 124,
			ninetalesalola: 816 + 125,
			diglettalola: 816 + 126,
			dugtrioalola: 816 + 127,
			meowthalola: 816 + 128,
			persianalola: 816 + 129,
			geodudealola: 816 + 130,
			graveleralola: 816 + 131,
			golemalola: 816 + 132,
			grimeralola: 816 + 133,
			mukalola: 816 + 134,
			exeggutoralola: 816 + 135,
			marowakalola: 816 + 136,
			greninjaash: 816 + 137,
			zygarde10: 816 + 138,
			zygardecomplete: 816 + 139,
			oricoriopompom: 816 + 140,
			oricoriopau: 816 + 141,
			oricoriosensu: 816 + 142,
			lycanrocmidnight: 816 + 143,
			wishiwashischool: 816 + 144,
			miniormeteor: 816 + 145,
			miniororange: 816 + 146,
			minioryellow: 816 + 147,
			miniorgreen: 816 + 148,
			miniorblue: 816 + 149,
			miniorviolet: 816 + 150,
			miniorindigo: 816 + 151,
			magearnaoriginal: 816 + 152,
			pikachuoriginal: 816 + 153,
			pikachuhoenn: 816 + 154,
			pikachusinnoh: 816 + 155,
			pikachuunova: 816 + 156,
			pikachukalos: 816 + 157,
			pikachualola: 816 + 158,
			pikachupartner: 816 + 159,
			lycanrocdusk: 816 + 160,
			necrozmaduskmane: 816 + 161,
			necrozmadawnwings: 816 + 162,
			necrozmaultra: 816 + 163,
			pikachustarter: 816 + 164,
			eeveestarter: 816 + 165,

			gumshoostotem: 735,
			raticatealolatotem: 816 + 120,
			marowakalolatotem: 816 + 136,
			araquanidtotem: 752,
			lurantistotem: 754,
			salazzletotem: 758,
			vikavolttotem: 738,
			togedemarutotem: 777,
			mimikyutotem: 778,
			mimikyubustedtotem: 778,
			ribombeetotem: 743,
			kommoototem: 784,

			venusaurmega: 984 + 0,
			charizardmegax: 984 + 1,
			charizardmegay: 984 + 2,
			blastoisemega: 984 + 3,
			beedrillmega: 984 + 4,
			pidgeotmega: 984 + 5,
			alakazammega: 984 + 6,
			slowbromega: 984 + 7,
			gengarmega: 984 + 8,
			kangaskhanmega: 984 + 9,
			pinsirmega: 984 + 10,
			gyaradosmega: 984 + 11,
			aerodactylmega: 984 + 12,
			mewtwomegax: 984 + 13,
			mewtwomegay: 984 + 14,
			ampharosmega: 984 + 15,
			steelixmega: 984 + 16,
			scizormega: 984 + 17,
			heracrossmega: 984 + 18,
			houndoommega: 984 + 19,
			tyranitarmega: 984 + 20,
			sceptilemega: 984 + 21,
			blazikenmega: 984 + 22,
			swampertmega: 984 + 23,
			gardevoirmega: 984 + 24,
			sableyemega: 984 + 25,
			mawilemega: 984 + 26,
			aggronmega: 984 + 27,
			medichammega: 984 + 28,
			manectricmega: 984 + 29,
			sharpedomega: 984 + 30,
			cameruptmega: 984 + 31,
			altariamega: 984 + 32,
			banettemega: 984 + 33,
			absolmega: 984 + 34,
			glaliemega: 984 + 35,
			salamencemega: 984 + 36,
			metagrossmega: 984 + 37,
			latiasmega: 984 + 38,
			latiosmega: 984 + 39,
			kyogreprimal: 984 + 40,
			groudonprimal: 984 + 41,
			rayquazamega: 984 + 42,
			lopunnymega: 984 + 43,
			garchompmega: 984 + 44,
			lucariomega: 984 + 45,
			abomasnowmega: 984 + 46,
			gallademega: 984 + 47,
			audinomega: 984 + 48,
			dianciemega: 984 + 49,

			syclant: 1152 + 0,
			revenankh: 1152 + 1,
			pyroak: 1152 + 2,
			fidgit: 1152 + 3,
			stratagem: 1152 + 4,
			arghonaut: 1152 + 5,
			kitsunoh: 1152 + 6,
			cyclohm: 1152 + 7,
			colossoil: 1152 + 8,
			krilowatt: 1152 + 9,
			voodoom: 1152 + 10,
			tomohawk: 1152 + 11,
			necturna: 1152 + 12,
			mollux: 1152 + 13,
			aurumoth: 1152 + 14,
			malaconda: 1152 + 15,
			cawmodore: 1152 + 16,
			volkraken: 1152 + 17,
			plasmanta: 1152 + 18,
			naviathan: 1152 + 19,
			crucibelle: 1152 + 20,
			crucibellemega: 1152 + 21,
			kerfluffle: 1152 + 22,
			pajantom: 1152 + 23,
			jumbao: 1152 + 24,
			caribolt: 1152 + 25,
			smokomodo: 1152 + 26,
			snaelstrom: 1152 + 27,

			syclar: 1188 + 0,
			embirch: 1188 + 1,
			flarelm: 1188 + 2,
			breezi: 1188 + 3,
			scratchet: 1188 + 4,
			necturine: 1188 + 5,
			cupra: 1188 + 6,
			argalis: 1188 + 7,
			brattler: 1188 + 8,
			cawdet: 1188 + 9,
			volkritter: 1188 + 10,
			snugglow: 1188 + 11,
			floatoy: 1188 + 12,
			caimanoe: 1188 + 13,
			pluffle: 1188 + 14,
			rebble: 1188 + 15,
			tactite: 1188 + 16,
			privatyke: 1188 + 17,
			nohface: 1188 + 18,
			monohm: 1188 + 19,
			duohm: 1188 + 20,
			// protowatt: 1188 + 21,
			voodoll: 1188 + 22,
			mumbao: 1188 + 23,

			// Digimon Icons
			botamon: 0 + 0,
			dodomon: 0 + 1,
			kuramon: 0 + 2,
			poyomon: 0 + 3,
			punimon: 0 + 4,
			yuramon: 0 + 5,
			bukamon: 0 + 6,
			dorimon: 0 + 7,
			koromon: 0 + 8,
			motimon: 0 + 9,
			nyaromon: 0 + 10,
			tanemon: 0 + 11,

			tokomon: 12 + 0,
			tsumemon: 12 + 1,
			tsunomon: 12 + 2,
			agumon: 12 + 3,
			aruraumon: 12 + 4,
			betamon: 12 + 5,
			biyomon: 12 + 6,
			clearagumon: 12 + 7,
			demidevimon: 12 + 8,
			dokunemon: 12 + 9,
			dorumon: 12 + 10,
			elecmon: 12 + 11,

			gabumon: 24 + 0,
			goburimon: 24 + 1,
			gomamon: 24 + 2,
			gotsumon: 24 + 3,
			kunemon: 24 + 4,
			modokibetamon: 24 + 5,
			muchomon: 24 + 6,
			otamamon: 24 + 7,
			palmon: 24 + 8,
			patamon: 24 + 9,
			penguinmon: 24 + 10,
			psychemon: 24 + 11,

			salamon: 36 + 0,
			shamanmon: 36 + 1,
			snowagumon: 36 + 2,
			snowgoburimon: 36 + 3,
			tentomon: 36 + 4,
			toyagumon: 36 + 5,
			tsukaimon: 36 + 6,
			airdramon: 36 + 7,
			akatorimon: 36 + 8,
			angemon: 36 + 9,
			bakemon: 36 + 10,
			birdramon: 36 + 11,

			blackgatomon: 48 + 0,
			centarumon: 48 + 1,
			coelamon: 48 + 2,
			darkrizamon: 48 + 3,
			devimon: 48 + 4,
			dolphmon: 48 + 5,
			dorugamon: 48 + 6,
			drimogemon: 48 + 7,
			flarerizamon: 48 + 8,
			frigimon: 48 + 9,
			fugamon: 48 + 10,
			garurumon: 48 + 11,

			gatomon: 60 + 0,
			gekomon: 60 + 1,
			geremon: 60 + 2,
			greymon: 60 + 3,
			guardromon: 60 + 4,
			gururumon: 60 + 5,
			hyogamon: 60 + 6,
			icedevimon: 60 + 7,
			icemon: 60 + 8,
			ikkakumon: 60 + 9,
			junglemojyamon: 60 + 10,
			kabuterimon: 60 + 11,

			kokatorimon: 72 + 0,
			kuwagamon: 72 + 1,
			leomon: 72 + 2,
			meicoomon: 72 + 3,
			meramon: 72 + 4,
			mikemon: 72 + 5,
			mojyamon: 72 + 6,
			monochromon: 72 + 7,
			morishellmon: 72 + 8,
			mudfrigimon: 72 + 9,
			nanimon: 72 + 10,
			ninjamon: 72 + 11,

			nisedrimogemon: 84 + 0,
			numemon: 84 + 1,
			ogremon: 84 + 2,
			piddomon: 84 + 3,
			platinumsukamon: 84 + 4,
			redvegiemon: 84 + 5,
			rockmon: 84 + 6,
			saberdramon: 84 + 7,
			sandyamamon: 84 + 8,
			seadramon: 84 + 9,
			shellmon: 84 + 10,
			shimaunimon: 84 + 11,

			soulmon: 96 + 0,
			sukamon: 96 + 1,
			tankmon: 96 + 2,
			togemon: 96 + 3,
			tyrannomon: 96 + 4,
			unimon: 96 + 5,
			vegiemon: 96 + 6,
			weedmon: 96 + 7,
			yamamon: 96 + 8,
			andromon: 96 + 9,
			angewomon: 96 + 10,
			beastmon: 96 + 11,

			blackweregarurumon: 108 + 0,
			bluemeramon: 108 + 1,
			digitamamon: 108 + 2,
			dorugreymon: 108 + 3,
			etemon: 108 + 4,
			garudamon: 108 + 5,
			gigadramon: 108 + 6,
			giromon: 108 + 7,
			iceleomon: 108 + 8,
			ladydevimon: 108 + 9,
			lillymon: 108 + 10,
			magnaangemon: 108 + 11,

			mamemon: 120 + 0,
			megadramon: 120 + 1,
			megakabuterimon: 120 + 2,
			megaseadramon: 120 + 3,
			meicrackmon: 120 + 4,
			meicrackmonviciousmode: 120 + 5,
			metalgreymonvaccine: 120 + 6,
			metalgreymonvirus: 120 + 7,
			metalmamemon: 120 + 8,
			meteormon: 120 + 9,
			monzaemon: 120 + 10,
			myotismon: 120 + 11,

			piximon: 132 + 0,
			shogungekomon: 132 + 1,
			skullgreymon: 132 + 2,
			tekkamon: 132 + 3,
			vademon: 132 + 4,
			vermilimon: 132 + 5,
			warumonzaemon: 132 + 6,
			waruseadramon: 132 + 7,
			weregarurumon: 132 + 8,
			whamon: 132 + 9,
			zudomon: 132 + 10,
			alphamon: 132 + 11,

			blackmetalgarurumon: 144 + 0,
			blackwargreymon: 144 + 1,
			boltmon: 144 + 2,
			cherubimonevil: 144 + 3,
			cherubimongood: 144 + 4,
			devitamamon: 144 + 5,
			dorugoramon: 144 + 6,
			ebemon: 144 + 7,
			herculeskabuterimon: 144 + 8,
			hiandromon: 144 + 9,
			lilithmon: 144 + 10,
			machinedramon: 144 + 11,

			magnadramon: 156 + 0,
			marineangemon: 156 + 1,
			metaletemon: 156 + 2,
			metalgarurumon: 156 + 3,
			metalseadramon: 156 + 4,
			ophanimon: 156 + 5,
			phoenixmon: 156 + 6,
			princemamemon: 156 + 7,
			raguelmon: 156 + 8,
			rasielmon: 156 + 9,
			rosemon: 156 + 10,
			saberleomon: 156 + 11,

			seraphimon: 168 + 0,
			venommyotismon: 168 + 1,
			vikemon: 168 + 2,
			wargreymon: 168 + 3,
		};

		if (altNums[id]) {
			num = altNums[id];
		}

		if (pokemon && pokemon.gender === 'F') {
			if (id === 'unfezant' || id === 'frillish' || id === 'jellicent' || id === 'meowstic' || id === 'pyroar') {
				num = altNums[id + 'f'];
			}
		}

		if (facingLeft) {
			altNums = {
				pikachubelle: 1044 + 0,
				pikachupopstar: 1044 + 1,
				clefairy: 1044 + 2,
				clefable: 1044 + 3,
				jigglypuff: 1044 + 4,
				wigglytuff: 1044 + 5,
				dugtrioalola: 1044 + 6,
				poliwhirl: 1044 + 7,
				poliwrath: 1044 + 8,
				mukalola: 1044 + 9,
				kingler: 1044 + 10,
				croconaw: 1044 + 11,
				cleffa: 1044 + 12,
				igglybuff: 1044 + 13,
				politoed: 1044 + 14,
				// unown gap
				sneasel: 1044 + 35,
				teddiursa: 1044 + 36,
				roselia: 1044 + 37,
				zangoose: 1044 + 38,
				seviper: 1044 + 39,
				castformrainy: 1044 + 40,
				absolmega: 1044 + 41,
				absol: 1044 + 42,
				regirock: 1044 + 43,
				torterra: 1044 + 44,
				budew: 1044 + 45,
				roserade: 1044 + 46,
				magmortar: 1044 + 47,
				togekiss: 1044 + 48,
				rotomwash: 1044 + 49,
				shayminsky: 1044 + 50,
				emboar: 1044 + 51,
				pansear: 1044 + 52,
				simisear: 1044 + 53,
				drilbur: 1044 + 54,
				excadrill: 1044 + 55,
				sawk: 1044 + 56,
				lilligant: 1044 + 57,
				garbodor: 1044 + 58,
				solosis: 1044 + 59,
				vanilluxe: 1044 + 60,
				amoonguss: 1044 + 61,
				klink: 1044 + 62,
				klang: 1044 + 63,
				klinklang: 1044 + 64,
				litwick: 1044 + 65,
				golett: 1044 + 66,
				golurk: 1044 + 67,
				kyuremblack: 1044 + 68,
				kyuremwhite: 1044 + 69,
				kyurem: 1044 + 70,
				keldeoresolute: 1044 + 71,
				meloetta: 1044 + 72,
				greninja: 1044 + 73,
				greninjaash: 1044 + 74,
				furfroudebutante: 1044 + 75,
				barbaracle: 1044 + 76,
				clauncher: 1044 + 77,
				clawitzer: 1044 + 78,
				sylveon: 1044 + 79,
				klefki: 1044 + 80,
				zygarde: 1044 + 81,
				zygarde10: 1044 + 82,
				zygardecomplete: 1044 + 83,
				dartrix: 1044 + 84,
				steenee: 1044 + 85,
				tsareena: 1044 + 86,
				comfey: 1044 + 87,
				miniormeteor: 1044 + 88,
				minior: 1044 + 89,
				miniororange: 1044 + 90,
				minioryellow: 1044 + 91,
				miniorgreen: 1044 + 92,
				miniorblue: 1044 + 93,
				miniorviolet: 1044 + 94,
				miniorindigo: 1044 + 95,
				dhelmise: 1044 + 96,
				necrozma: 1044 + 97,
				marshadow: 1044 + 98,
				pikachuoriginal: 1044 + 99,
				pikachupartner: 1044 + 100,
				necrozmaduskmane: 1044 + 101,
				necrozmadawnwings: 1044 + 102,
				necrozmaultra: 1044 + 103,
				stakataka: 1044 + 104,
				blacephalon: 1044 + 105,
			};
			if (altNums[id]) {
				num = altNums[id];
			}
		}

		let top = Math.floor(num / 12) * 30;
		let left = (num % 12) * 40;
		let fainted = (pokemon && pokemon.fainted ? ';opacity:.7;filter:contrast(0)' : '');

		let spriteSheet = 'sprites/smicons-sheet.png?a5';

		// Digimon Icons
		if (digi) spriteSheet = 'sprites/digimon/sprites/digimonicons-sheet.png';

		return 'background:transparent url(' + Dex.resourcePrefix + '' + spriteSheet + ') no-repeat scroll -' + left + 'px -' + top + 'px' + fainted;
	},

	getTeambuilderSprite(pokemon: any, gen: number = 0) {
		if (!pokemon) return '';
		let id = toId(pokemon.species);
		let spriteid = pokemon.spriteid;
		let template = Dex.getTemplate(pokemon.species);
		if (pokemon.species && !spriteid) {
			spriteid = template.spriteid || toId(pokemon.species);
		}
		if (Dex.getTemplate(pokemon.species).exists === false) {
			return 'background-image:url(' + Dex.resourcePrefix + 'sprites/bw/0.png);background-position:10px 5px;background-repeat:no-repeat';
		}
		let shiny = (pokemon.shiny ? '-shiny' : '');
		// let sdata;
		// if (BattlePokemonSprites[id] && BattlePokemonSprites[id].front && !Dex.prefs('bwgfx')) {
		// 	if (BattlePokemonSprites[id].front.anif && pokemon.gender === 'F') {
		// 		spriteid += '-f';
		// 		sdata = BattlePokemonSprites[id].front.anif;
		// 	} else {
		// 		sdata = BattlePokemonSprites[id].front.ani;
		// 	}
		// } else {
		// 	return 'background-image:url(' + Dex.resourcePrefix + 'sprites/bw' + shiny + '/' + spriteid + '.png);background-position:10px 5px;background-repeat:no-repeat';
		// }
		if (Dex.prefs('nopastgens')) gen = 6;
		let spriteDir = Dex.resourcePrefix + 'sprites/xydex';
		if ((!gen || gen >= 6) && !template.isNonstandard && !Dex.prefs('bwgfx')) {
			let offset = '-2px -3px';
			if (template.gen >= 7) offset = '-6px -7px';
			if (id.substr(0, 6) === 'arceus') offset = '-2px 7px';
			if (id === 'garchomp') offset = '-2px 2px';
			if (id === 'garchompmega') offset = '-2px 0px';
			return 'background-image:url(' + spriteDir + shiny + '/' + spriteid + '.png);background-position:' + offset + ';background-repeat:no-repeat';
		}
		spriteDir = Dex.resourcePrefix + 'sprites/bw';
		if (gen <= 1 && template.gen <= 1) spriteDir = Dex.resourcePrefix + 'sprites/rby';
		else if (gen <= 2 && template.gen <= 2) spriteDir = Dex.resourcePrefix + 'sprites/gsc';
		else if (gen <= 3 && template.gen <= 3) spriteDir = Dex.resourcePrefix + 'sprites/rse';
		else if (gen <= 4 && template.gen <= 4) spriteDir = Dex.resourcePrefix + 'sprites/dpp';
		return 'background-image:url(' + spriteDir + shiny + '/' + spriteid + '.png);background-position:10px 5px;background-repeat:no-repeat';
	},

	getItemIcon(item: any) {
		let num = 0;
		if (typeof item === 'string' && exports.BattleItems) item = exports.BattleItems[toId(item)];
		if (item && item.spritenum) num = item.spritenum;

		let top = Math.floor(num / 16) * 24;
		let left = (num % 16) * 24;
		return 'background:transparent url(' + Dex.resourcePrefix + 'sprites/itemicons-sheet.png) no-repeat scroll -' + left + 'px -' + top + 'px';
	},

	getTypeIcon(type: string, b?: boolean) { // b is just for utilichart.js
		if (!type) return '';
		let sanitizedType = type.replace(/\?/g, '%3f');
		return '<img src="' + Dex.resourcePrefix + 'sprites/types/' + sanitizedType + '.png" alt="' + type + '" height="14" width="32"' + (b ? ' class="b"' : '') + ' />';
	},
};
