// Public value for tickets (T-120). Not a secret: the /exec URL of the Google Apps Script web app that receives "Teach" requests and decks
// (tools/google/ticket-endpoint.gs, steps in docs/briefs/ticket-endpoint-setup.md). Empty = not set up: the Teach button opens the GitHub request instead.
self.ISF_TICKET = {
  endpoint: ''
};
