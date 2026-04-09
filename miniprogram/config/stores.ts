export interface StoreConfigItem {
  key: string
  name: string
  shortName: string
}

export const storeConfigs: StoreConfigItem[] = [
  {
    key: 'jingcai_main',
    name: '晶采 · 龙灯路店',
    shortName: '龙灯路店'
  }
]

export const defaultStoreName = storeConfigs[0].name

export const storeOptions = storeConfigs.map((store) => ({
  label: store.shortName,
  value: store.name
}))

export const allStoreOption = {
  label: '全部门店',
  value: 'all'
}

export function getStoreShortName(storeName: string) {
  return storeConfigs.find((store) => store.name === storeName)?.shortName || storeName
}
