const storeConfigs = [
  {
    key: 'jingcai_main',
    name: '晶采 · 龙灯路店',
    shortName: '龙灯路店'
  }
];

function getStoreShortName(storeName) {
  const match = storeConfigs.find((store) => store.name === storeName);
  return match ? match.shortName : storeName;
}

module.exports = {
  storeConfigs,
  getStoreShortName
};
