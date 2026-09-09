'use strict';
// Pure local decisions. No model status or cached model direction enters this policy.
const NativeFindPolicy = {
  approach(o, previous = '') {
    if (o.x < (previous === 'left' ? 0.40 : 1/3)) return 'left';
    if (o.x > (previous === 'right' ? 0.60 : 2/3)) return 'right';
    if (o.y < 0) return 'aim_up';
    if (o.y > 1) return 'aim_down';
    return 'forward';
  },
  direction(o, handPhase, canApproach, previous = '') {
    if (!o?.valid || !Number.isFinite(o.meters)) return 'lost';
    if (handPhase) {
      if (!Number.isFinite(o.handX) || !Number.isFinite(o.handY)) return 'hand_missing';
      const dx = o.x - o.handX, dy = o.y - o.handY;
      // Stay within a deadband instead of alternating opposite corrections.
      const band = previous.startsWith('hand_') ? 0.045 : 0.065;
      if (Math.abs(dx) > band && Math.abs(dx) >= Math.abs(dy) * 0.7) return dx < 0 ? 'hand_left' : 'hand_right';
      if (Math.abs(dy) > band) return dy < 0 ? 'hand_up' : 'hand_down';
      // Image overlap is not contact. Request a semantic contact check while stopped.
      return 'hold';
    }
    if (o.meters <= 0.85) return 'stop';
    if (o.x < (previous === 'left' ? 0.46 : 0.40)) return 'left';
    if (o.x > (previous === 'right' ? 0.54 : 0.60)) return 'right';
    return canApproach ? 'forward' : 'aligned';
  },
  fresh(observation, now) { return observation?.valid === true && now - observation.at < 500 && now >= observation.at; },
  repeatMs(code) {
    if (code === 'search') return 2500;
    return ['aligned', 'hand_missing', 'hold', 'stop', 'reach'].includes(code) ? 2200 : 1000;
  }
};
if (typeof module !== 'undefined') module.exports = NativeFindPolicy;
