# Deck brief: Toph, the First Metalbender

Paste everything below the line into your Magic Deck Builder agent.

---

Build a 100-card Commander deck (singleton, Commander-legal) with **Toph, the First Metalbender** as the commander.

**Commander:** Toph, the First Metalbender {1}{R}{G}{W}, Legendary Creature — Human Warrior Ally. Colour identity: red, green, white (Naya).
- "Nontoken artifacts you control are lands in addition to their other types. (They don't gain the ability to {T} for mana.)"
- "At the beginning of your end step, earthbend 2." (Target land you control becomes a 0/0 creature with haste that's still a land, with two +1/+1 counters. When it dies or is exiled, it returns to the battlefield tapped.)

**The idea:** Toph makes every nontoken artifact a land. So:
- artifacts trigger landfall when they enter;
- they can be earthbent into hasty creatures that come back when they die;
- "lands matter" cards also count your artifacts.

Build around that overlap:
- **Landfall payoffs:** Avenger of Zendikar, Tireless Provisioner, Lotus Cobra, Omnath-style.
- **Cheap artifacts that re-enter or come back:** Ichor Wellspring, Mishra's Bauble, Ornithopter, Myr.
- **Ways to make earthbent lands bigger or keep them:** +1/+1 counter doublers, Hardened Scales, proliferate.
- **Other earthbend cards** from Avatar: The Last Airbender (TLA/TLE): Badgermole, Earthbender Ascension, Avatar Kyoshi, Bumi, Ba Sing Se, Toph's other printings.
- **Sacrifice outlets:** an earthbent land returns when it dies, so sacrificing it is close to free value.

**Bracket:** aim for **Bracket 3** (no more than three Game Changers, no mass land destruction, no early two-card infinite combos). Say which bracket you built it for.

**Rules for the list:**
- Exactly 100 cards including Toph; about 36–38 lands. Artifacts count as lands for Toph, so you can run fewer real lands if you include cheap artifacts, but count real mana sources carefully.
- Only cards in Toph's colour identity (R, G, W, and colourless).
- Avoid cards whose text depends on things outside a game (real-world objects, the card's art, "un-" sets).
- No personal names anywhere in the file.

**Output format** (plain text, one card per line, exactly like this):

```
// <Deck name> (Toph, the First Metalbender)
// Bracket <N>
// COMMANDER
1 Toph, the First Metalbender
// MAINBOARD
1 Sol Ring
1 ...
```

Save it as a `.txt` file named `<Deck name> [B<N>] (Toph, the First Metalbender).txt` in the ManaBox folder in Google Drive. ICEYfish's daily Drive check picks it up at 12:43 UTC. It then:
1. imports the deck;
2. bracket-checks it (20,000 games plus a round robin against every built-in deck);
3. teaches any card the engine doesn't fully understand;
4. adds it to the deck chooser and sends a push notification with its verified bracket.
