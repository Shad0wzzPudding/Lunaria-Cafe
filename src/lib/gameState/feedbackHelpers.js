let nextId = 1;

export function makePopup(payload, legacyCoins = 0) {
  const id = `popup-${Date.now()}-${nextId++}`;

  if (typeof payload === 'string') {
    return {
      id,
      icon: null,
      message: payload,
      coins: legacyCoins > 0 ? legacyCoins : 0,
    };
  }

  return {
    id,
    icon: payload.icon ?? null,
    message: payload.message ?? '',
    amount: payload.amount,
    coins: payload.amount > 0 ? payload.amount : 0,
  };
}

export function makeCoinFloat(amount) {
  return {
    id: `coin-${Date.now()}-${nextId++}`,
    amount,
  };
}

export function pushPopup(state, payload, legacyCoins = 0) {
  const popup = makePopup(payload, legacyCoins);

  return {
    ...state.ui,
    popups: [...state.ui.popups.slice(-4), popup],
    coinFloat:
      popup.coins > 0
        ? makeCoinFloat(popup.coins)
        : state.ui.coinFloat,
  };
}