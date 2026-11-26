// T-102: the iPads (upright, sideways) select first like the phones, and a desktop mouse keeps its own flow: the second half of phone-card-tap.ui.js.
process.env.PHONE_TAP_ONLY = 'iPad|desktop';
require('./phone-card-tap.ui.js');
