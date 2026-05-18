let nextId = 1;

export function makePopup(message, coins = 0) {
  const id = `popup-${Date.now()}-${nextId++}`;
  return { id, message, coins: coins > 0 ? coins : 0 };
}

export function makeCoinFloat(amount) {
  return { id: `coin-${Date.now()}-${nextId++}`, amount };
}

export function pushPopup(state, message, coins = 0) {
  return {
    ...state.ui,
    popups: [...state.ui.popups.slice(-6), makePopup(message, coins)],
    coinFloat: coins > 0 ? makeCoinFloat(coins) : state.ui.coinFloat,
  };
}
