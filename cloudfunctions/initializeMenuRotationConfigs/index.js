const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event) => {
  const { action = 'preview', overwriteExisting = false } = event || {}

  try {
    const currentUser = await getCurrentUser(event)
    if (!currentUser || currentUser.role !== 'admin') {
      return {
        success: false,
        error: 'FORBIDDEN',
        message: '需要管理员权限'
      }
    }

    const plan = await buildInitializationPlan(Boolean(overwriteExisting), currentUser)

    if (action === 'preview') {
      return {
        success: true,
        action: 'preview',
        plan
      }
    }

    if (action !== 'initialize') {
      return {
        success: false,
        error: 'INVALID_ACTION',
        message: 'action 仅支持 preview 或 initialize'
      }
    }

    const result = await applyInitializationPlan(plan)
    return {
      success: true,
      action: 'initialize',
      plan,
      result,
      message: '门店轮换配置初始化完成'
    }
  } catch (error) {
    console.error('初始化门店轮换配置失败:', error)
    return {
      success: false,
      error: 'SERVER_ERROR',
      message: error.message || '初始化门店轮换配置失败'
    }
  }
}

async function getCurrentUser(event = {}) {
  const { sessionToken } = event || {}

  if (sessionToken) {
    const sessionResult = await db.collection('user_sessions').where({
      sessionToken,
      isActive: true
    }).get()

    if (sessionResult.data.length > 0) {
      const session = sessionResult.data[0]
      const isExpired = !session.expiresAt || new Date(session.expiresAt).getTime() <= Date.now()

      if (!isExpired && session.isRegistered && session.userId) {
        const userDoc = await db.collection('users').doc(session.userId).get()
        if (userDoc.data && userDoc.data.status === 'active') {
          return {
            ...userDoc.data,
            role: getUserRole(userDoc.data),
            openid: session.openid
          }
        }
      }
    }
  }

  const wxContext = cloud.getWXContext()
  if (!wxContext.OPENID) {
    return null
  }

  const authResult = await db.collection('auth').where({
    _openid: wxContext.OPENID
  }).get()

  if (authResult.data.length === 0 || !authResult.data[0].phone) {
    return null
  }

  const userResult = await db.collection('users').where({
    phone: authResult.data[0].phone,
    status: 'active'
  }).get()

  if (userResult.data.length === 0) {
    return null
  }

  const user = userResult.data[0]
  return {
    ...user,
    role: getUserRole(user)
  }
}

function getUserRole(user) {
  if (user.role) return user.role
  if (user.isAdmin === true || user.userType === 'admin') return 'admin'
  if (user.userType === 'staff') return 'staff'
  return 'customer'
}

async function buildInitializationPlan(overwriteExisting, currentUser) {
  const menus = await fetchAllRecords('daily_menus')
  const storeMenus = menus.filter(item => typeof item.store === 'string' && item.store.trim() !== '')
  const storeNames = [...new Set(storeMenus.map(item => item.store.trim()))].sort()
  const existingConfigs = await fetchAllRecords('menu_rotation_configs')
  const globalLegacyStartDate = await getLegacyStartDate()

  const items = []

  for (const store of storeNames) {
    const currentStoreMenus = storeMenus
      .filter(item => item.store === store)
      .map(item => Number(item.day))
      .filter(day => Number.isInteger(day))
      .sort((a, b) => a - b)

    if (currentStoreMenus.length === 0) {
      continue
    }

    const minDay = currentStoreMenus[0]
    const maxDay = currentStoreMenus[currentStoreMenus.length - 1]
    const existingConfig = existingConfigs.find(item => item.store === store)
    const storeLegacyStartDate = await getLegacyStartDate(store)
    const menuStartDate = existingConfig?.menu_start_date || storeLegacyStartDate || globalLegacyStartDate

    const baseConfig = {
      store,
      menu_start_date: menuStartDate,
      start_day: minDay,
      end_day: maxDay,
      status: 'active',
      updatedAt: new Date(),
      updatedBy: currentUser.name || currentUser.phone || '管理员'
    }

    if (existingConfig && !overwriteExisting) {
      items.push({
        store,
        action: 'skip_existing',
        reason: '该门店已有轮换配置',
        existingConfig: simplifyConfig(existingConfig),
        proposedConfig: simplifyConfig(baseConfig)
      })
      continue
    }

    items.push({
      store,
      action: existingConfig ? 'update' : 'create',
      existingConfig: existingConfig ? simplifyConfig(existingConfig) : null,
      proposedConfig: simplifyConfig(baseConfig)
    })
  }

  return {
    overwriteExisting,
    totalStores: storeNames.length,
    creatableCount: items.filter(item => item.action === 'create').length,
    updatableCount: items.filter(item => item.action === 'update').length,
    skippedCount: items.filter(item => item.action === 'skip_existing').length,
    items
  }
}

async function applyInitializationPlan(plan) {
  const createdStores = []
  const updatedStores = []
  const skippedStores = []

  for (const item of plan.items) {
    if (item.action === 'skip_existing') {
      skippedStores.push(item.store)
      continue
    }

    const saveData = {
      ...item.proposedConfig,
      updatedAt: new Date(),
      updatedBy: item.proposedConfig.updatedBy
    }

    const existing = await db.collection('menu_rotation_configs').where({
      store: item.store
    }).get()

    if (existing.data.length > 0) {
      await db.collection('menu_rotation_configs').doc(existing.data[0]._id).update({
        data: saveData
      })
      updatedStores.push(item.store)
    } else {
      await db.collection('menu_rotation_configs').add({
        data: saveData
      })
      createdStores.push(item.store)
    }
  }

  return {
    createdCount: createdStores.length,
    updatedCount: updatedStores.length,
    skippedCount: skippedStores.length,
    createdStores,
    updatedStores,
    skippedStores
  }
}

async function getLegacyStartDate(store) {
  const whereCondition = store
    ? { key: 'menu_start_date', store }
    : { key: 'menu_start_date' }

  const result = await db.collection('sysinfo').where(whereCondition).get()
  if (result.data.length === 0) {
    return null
  }

  const exactMatch = store
    ? result.data.find(item => item.store === store)
    : result.data.find(item => !item.store)

  return (exactMatch || result.data[0]).value || null
}

async function fetchAllRecords(collectionName) {
  const pageSize = 100
  const records = []
  let skip = 0

  while (true) {
    const result = await db.collection(collectionName)
      .skip(skip)
      .limit(pageSize)
      .get()

    const page = result.data || []
    records.push(...page)

    if (page.length < pageSize) {
      break
    }

    skip += pageSize
  }

  return records
}

function simplifyConfig(config) {
  return {
    store: config.store,
    menu_start_date: config.menu_start_date,
    start_day: Number(config.start_day),
    end_day: Number(config.end_day),
    status: config.status || 'active',
    updatedBy: config.updatedBy || ''
  }
}
