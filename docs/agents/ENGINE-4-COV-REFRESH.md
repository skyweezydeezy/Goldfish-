# Set-data coverage refresh (T-023, Card Rules Engine 4)

`node tools/fetch-sets.js --report` on claude/engine-rules after rules batch 56 (with live v152's User-Agent fix). 309 cards' stored coverage (`cov`) changed; nothing else in the set data did. By status: partial→full 190, none→full 46, partial→approx 38, none→approx 11, partial→partial 15 (lines changed), none→partial 4, full→approx 3 (Titan of Littjara, Light-Paws, Waterbending Lesson: tagged approx by earlier batches, the stored record was older), full→full 2.

```
Abomination of Llanowar: partial->full
Abzan Charm: partial->full
Adriana, Captain of the Guard: partial->full
Aether Gale: none->full
Airbending Lesson: partial->full
Ajani Steadfast: partial->full
Alisaie Leveilleur: partial->full
Amazing Acrobatics: partial->full
Amoeboid Changeling: partial->approx
Amphin Mutineer: partial->full
Ancient Adamantoise: partial->full
Angelic Field Marshal: partial->approx
Ao, the Dawn Sky: partial->full
Apex of Power: partial->full
Arbaaz Mir: none->full
Archenemy's Charm: partial->full
Archetype of Courage: partial->full
Archpriest of Shadows: partial->approx
Artificer Class: partial->approx
Astarion, the Decadent: partial->full
Avacyn, Angel of Horror: partial->full
Avatar Roku, Firebender: partial->approx
Avenger of the Fallen: partial->full
Azure Beastbinder: partial->full
Azusa's Many Journeys // Likeness of the Seeker: partial->full
Baeloth Barrityl, Entertainer: partial->full
Balor: partial->full
Bandit's Talent: partial->full
Bane of Bala Ged: none->full
Barkform Harvester: partial->full
Barrensteppe Siege: partial->approx
Beacon of Unrest: none->approx
Big Mother Mouser: partial->full
Biotransference: partial->approx
Bladewing the Risen: partial->approx
Blasting Station: partial->approx
Bloodline Necromancer: partial->full
Blossoming Tortoise: partial->full
Bone-Cairn Butcher: partial->approx
Bonny Pall, Clearcutter: partial->full
Braid of Fire: none->full
Breaching Dragonstorm: partial->approx
Brightcap Badger // Fungus Frolic: partial->full
Captain Howler, Sea Scourge: partial->approx
Cartographer's Hawk: partial->full
Cayth, Famed Mechanist: partial->full
Cerulean Wisps: partial->full
Chainsaw: partial->approx
Champions from Beyond: partial->full
Chandra, Awakened Inferno: partial->full
Chandra, Hope's Beacon: partial->full
Chrome Host Seedshark: partial->approx
Colossification: partial->full
Commit // Memory: partial->full
Commune with Lava: none->full
Coppercoat Vanguard: none->full
Crossway Troublemakers: partial->approx
Cryptcaller Chariot: partial->full
Crystalline Sliver: none->full
Darksteel Reactor: partial->full
Deadbridge Chant: partial->full
Death Kiss: partial->full
Decoction Module: partial->full
Depthshaker Titan: partial->full
Desecrated Tomb: none->full
Desert: partial->full
Dihada, Binder of Wills: partial->full
Dissipation Field: none->full
Drag to the Roots: partial->full
Echocasting Symposium: partial->full
Edgar, Charmed Groom // Edgar Markov's Coffin: partial->full
Elesh Norn // The Argent Etchings: partial->partial
Elturel Survivors: partial->full
Encroaching Mycosynth: none->approx
Erinis, Gloom Stalker: partial->full
Eternal Skylord: partial->full
Eumidian Hatchery: partial->full
Exhume: none->approx
Ezuri, Stalker of Spheres: partial->full
Fanatic of Mogis: none->full
Fear of Sleep Paralysis: partial->full
Felothar the Steadfast: partial->full
Fiend Hunter: partial->approx
Fiendlash: partial->full
Filth: partial->full
Final Act: partial->full
Fire Lord Azula: none->partial
Firebending Student: partial->full
Flagstones of Trokair: partial->full
Flash Photography: partial->full
Flourishing Defenses: none->full
Fortune Teller's Talent: partial->approx
Frontier Siege: partial->approx
Fumulus, the Infestation: partial->partial
Galvanic Blast: partial->full
Galvanic Iteration: partial->full
Generous Patron: partial->full
Ghen, Arcanum Weaver: none->approx
Gisa and Geralf: partial->full
Gixian Puppeteer: partial->full
Glacier Godmaw: partial->full
Glarb, Calamity's Augur: partial->full
Glorious Sunrise: partial->full
Goblin War Strike: none->full
Gonti's Aether Heart: none->full
Grave Betrayal: none->full
Gravedig: partial->full
Grim Reaper's Sprint: partial->full
Grumgully, the Generous: none->full
Guardian Scalelord: partial->partial
Gyruda, Doom of Depths: partial->full
Hapatra, Vizier of Poisons: partial->full
Hare Apparent: none->full
Heartbeat of Spring: none->approx
Heartless Act: partial->full
Heirloom Blade: partial->approx
Hoarding Ogre: partial->full
Horizon Stone: none->full
Horn of the Mark: none->full
Hour of Revelation: partial->full
Hungering Hydra: partial->full
Hunter's Talent: partial->full
Hydra Broodmaster: none->full
Hydra Omnivore: none->full
Idol of False Gods: partial->partial
Indomitable Might: partial->full
Infiltration Lens: partial->full
Ink-Eyes, Servant of Oni: partial->full
Izzet Generatorium: partial->full
Jaws of Defeat: none->full
Jegantha, the Wellspring: partial->full
K-9, Mark I: partial->full
Kaito, Bane of Nightmares: partial->full
Karazikar, the Eye Tyrant: partial->full
Katilda, Dawnhart Prime: partial->full
Kaya, Geist Hunter: partial->full
Keeper of Fables: none->full
Kess, Dissident Mage: partial->approx
Kheru Goldkeeper: partial->partial
Khârn the Betrayer: partial->full
Killian, Ink Duelist: partial->approx
Kiora, the Rising Tide: partial->full
Kishla Skimmer: partial->full
Koth, Fire of Resistance: partial->full
Kozilek's Command: full->full
Kruphix, God of Horizons: partial->full
Labyrinth of Skophos: partial->full
Laughing Jasper Flint: partial->full
Legion's Landing // Adanto, the First Fort: partial->full
Lembas: partial->full
Light-Paws, Emperor's Voice: full->approx
Liliana Vess: partial->full
Liliana's Contract: partial->full
Liquimetal Coating: none->full
Lord of the Void: partial->full
Lost Monarch of Ifnir: partial->partial
MacCready, Lamplight Mayor: none->full
Maelstrom Nexus: none->full
Maester Seymour: none->full
Mage Slayer: partial->full
Mana Flare: none->approx
Marauding Mako: partial->full
Marchesa, the Black Rose: partial->approx
Matoya, Archon Elder: none->full
Metropolis Reformer: partial->full
Michelangelo, Weirdness to 11: partial->full
Might of the Meek: partial->approx
Minsc & Boo, Timeless Heroes: partial->full
Mirelurk Queen: partial->partial
Mirror Room // Fractured Realm: partial->full
Misleading Signpost: partial->full
Mob Rule: none->full
Mulch: none->full
Mutable Explorer: partial->approx
Mycosynth Golem: partial->full
Naya Charm: partial->full
Nest of Scarabs: none->full
Neyali, Suns' Vanguard: none->partial
Nightshade Harvester: none->full
Nissa, Ascended Animist: partial->full
Norn's Choirmaster: partial->full
Norn's Decree: partial->full
Obelisk Spider: partial->full
Olórin's Searing Light: partial->full
On Wings of Gold: none->full
Orcish Siegemaster: partial->full
Ordeal of Nylea: partial->full
Ozai, the Phoenix King: partial->partial
Parapet Thrasher: partial->partial
Pariah's Shield: partial->full
Pinnacle Emissary: partial->full
Pit of Offerings: partial->full
Polluted Bonds: none->full
Polymorphist's Jest: none->full
Portal Mage: partial->full
Prava of the Steel Legion: partial->approx
Price of Fame: partial->full
Prismari Charm: partial->full
Prismari, the Inspiration: partial->full
Psychotic Fury: partial->approx
Queen Allenal of Ruadach: partial->full
Quick Sliver: partial->full
Ral, Storm Conduit: partial->full
Rat Colony: partial->full
Reckless Endeavor: none->full
Redemption Arc: partial->full
Relic of Progenitus: partial->full
Repercussion: none->full
Research Thief: partial->full
Resurrection Orb: partial->full
Retether: none->full
Rivaz of the Claw: partial->approx
Rona, Herald of Invasion // Rona, Tolarian Obliterator: partial->full
Sami, Wildcat Captain: partial->full
Saruman, the White Hand: none->partial
Scrabbling Claws: partial->full
Screeching Scorchbeast: partial->partial
Scytheclaw Raptor: none->full
Secret Arcade // Dusty Parlor: none->full
See Double: partial->partial
Seizan, Perverter of Truth: none->approx
Shadow of Mortality: none->full
Shaman of the Pack: none->full
Shanid, Sleepers' Scourge: partial->approx
Shared Summons: none->full
Shay Cormac: partial->full
Shield Sphere: partial->full
Shrieking Drake: partial->full
Sigarda, Font of Blessings: partial->full
Silent Sentinel: partial->full
Skyhunter Strike Force: partial->full
Sludge Monster: partial->full
Smoke Bomb: partial->full
Solitary Confinement: partial->full
Sorcerer Class: partial->partial
Sorin Markov: partial->full
Sorin, Imperious Bloodlord: partial->full
Soulless Jailer: partial->full
Sower of Discord: partial->full
Sozin's Comet: partial->full
Spawning Kraken: none->approx
Spider Manifestation: partial->full
Spiked Corridor // Torture Pit: partial->approx
Spinner of Souls: partial->full
Spiteful Sliver: none->full
Squee, Goblin Nabob: none->full
Stadium Headliner: partial->full
Staff of Titania: partial->full
Storm of Saruman: partial->approx
Submerge: partial->full
Subtlety: partial->full
Swarm Intelligence: none->full
Tato Farmer: partial->full
Teferi, Temporal Archmage: partial->full
Tegwyll, Duke of Splendor: partial->full
Teysa, Orzhov Scion: partial->full
Tezzeret, Master of the Bridge: partial->full
The Balrog of Moria: partial->approx
The First Sliver: partial->full
The Legend of Roku // Avatar Roku: partial->full
The Master, Multiplied: partial->full
The Rise of Sozin // Fire Lord Sozin: partial->partial
The Spear of Leonidas: partial->full
The Wise Mothman: partial->partial
Thraben Charm: partial->full
Tidal Barracuda: partial->full
Tiller Engine: partial->full
Timber Protector: full->full
Tinybones Joins Up: partial->full
Titan of Littjara: full->approx
Titania, Nature's Force: partial->approx
Titanoth Rex: partial->approx
Tivit, Seller of Secrets: partial->full
Tormod, the Desecrator: partial->full
Transmutation Font: none->partial
Trash for Treasure: partial->full
Tromell, Seymour's Butler: partial->full
Turnabout: none->approx
Tyrant's Familiar: partial->approx
Tyvar Kell: partial->full
Unable to Scream: partial->full
Unholy Annex // Ritual Chamber: partial->full
Unlicensed Hearse: partial->full
Urza's Factory: partial->full
Verdant Command: partial->full
Victory Chimes: partial->full
Vincent, Vengeful Atoner: partial->full
Vision Skeins: none->full
Vivien, Champion of the Wilds: partial->full
Volcanic Torrent: partial->full
Wall of Frost: partial->full
Wand of Orcus: partial->approx
Warden of Evos Isle: partial->full
Watcher of the Spheres: partial->full
Waterbending Lesson: full->approx
Whitemane Lion: partial->full
Wildsear, Scouring Maw: partial->full
Wildwood Scourge: partial->full
Will of the Temur: partial->full
Within Range: partial->full
Wondrous Crucible: partial->full
Worldwalker Helm: partial->approx
Yorion, Sky Nomad: partial->partial
Yuna, Hope of Spira: none->approx
Zirda, the Dawnwaker: partial->full
Zo-Zu the Punisher: none->approx
Zodiark, Umbral God: partial->approx
Zuko, Exiled Prince: partial->approx
Éomer, King of Rohan: partial->full
```
