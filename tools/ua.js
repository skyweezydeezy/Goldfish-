// The request headers every Node tool sends to Scryfall and Commander Spellbook. Scryfall rejects Node's default User-Agent
// ("generic_user_agent", HTTP 400) and asks API clients to name themselves and send an Accept header.
const UA = 'ICEYfish-tools/1.0';
const HEADERS = { 'User-Agent': UA, Accept: 'application/json;q=0.9,*/*;q=0.8' };
module.exports = { UA, HEADERS };
