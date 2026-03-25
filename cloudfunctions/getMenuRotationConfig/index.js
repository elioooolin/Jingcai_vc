const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event) => {
  const { store } = event

  try {
    if (!store) {
      return {
        success: false,
        error: 'MISSING_STORE',
        message: '缺少门店参数'
      }
    }

    const currentUser = await getCurrentUser(event)
    if (!currentUser || !['admin', 'staff', 'customer'].includes(currentUser.role)) {
      return {
        success: false,
        error: 'FORBIDDEN',
        message: '无权查看菜单轮换配置'
      }
    }

    const menuBounds = await getMenuDayBounds(store)
    if (!menuBounds) {
      return {
        success: true,
        config: null,
        source: null,
        menuBounds: null
      }
    }

    const rotationConfig = await getEffectiveRotationConfig(store, menuBounds)

    return {
      success: true,
      config: rotationConfig,
      source: rotationConfig?.source || null,
      menuBounds
    }
  } catch (error) {
    console.error('获取门店菜单轮换配置失败:', error)
    return {
      success: false,
      error: 'SERVER_ERROR',
      message: error.message || '获取门店菜单轮换配置失败'
    }
  }
}

async function getCurrentUser(event = {}) {
  const { sessionToken } = event

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

async function getEffectiveRotationConfig(store, menuBounds) {
  const configResult = await db.collection('menu_rotation_configs').where({ store }).get()
  if (configResult.data.length > 0) {
    const config = normalizeRotationConfig(configResult.data[0])
    validateRotationConfig(config, menuBounds, store)
    return {
      ...config,
      supplement_available_weekdays: config.supplement_available_weekdays !== undefined ? config.supplement_available_weekdays : [2, 5],
      source: 'menu_rotation_configs'
    }
  }

  const storeLegacy = await db.collection('sysinfo').where({
    key: 'menu_start_date',
    store
  }).get()

  if (storeLegacy.data.length > 0) {
    return {
      menu_start_date: storeLegacy.data[0].value,
      start_day: menuBounds.minDay,
      end_day: menuBounds.maxDay,
      supplement_available_weekdays: [2, 5],
      source: 'legacy_sysinfo_store'
    }
  }

  const globalLegacy = await db.collection('sysinfo').where({
    key: 'menu_start_date'
  }).get()

  if (globalLegacy.data.length > 0) {
    return {
      menu_start_date: globalLegacy.data[0].value,
      start_day: menuBounds.minDay,
      end_day: menuBounds.maxDay,
      supplement_available_weekdays: [2, 5],
      source: 'legacy_sysinfo_global'
    }
  }

  return null
}

async function getMenuDayBounds(store) {
  const result = await db.collection('daily_menus').where({ store }).get()
  if (result.data.length === 0) {
    return null
  }

  const days = result.data
    .map(item => Number(item.day))
    .filter(day => Number.isInteger(day))
    .sort((a, b) => a - b)

  if (days.length === 0) {
    return null
  }

  return {
    minDay: days[0],
    maxDay: days[days.length - 1],
    totalDays: days.length
  }
}

function normalizeRotationConfig(config) {
  const supplementWeekdays = Array.isArray(config.supplement_available_weekdays)
    ? config.supplement_available_weekdays.map((day) => Number(day)).filter((day) => Number.isInteger(day) && day >= 1 && day <= 7)
    : undefined

  return {
    menu_start_date: config.menu_start_date || config.value,
    start_day: Number(config.start_day),
    end_day: Number(config.end_day),
    supplement_available_weekdays: supplementWeekdays
  }
}

function validateRotationConfig(config, menuBounds, store) {
  if (!config.menu_start_date) {
    throw new Error(`${store} 缺少 menu_start_date 配置`)
  }

  if (!Number.isInteger(config.start_day) || config.start_day < 1) {
    throw new Error(`${store} 的 start_day 非法`)
  }

  if (!Number.isInteger(config.end_day) || config.end_day < config.start_day) {
    throw new Error(`${store} 的 end_day 非法`)
  }

  if (config.start_day < menuBounds.minDay) {
    throw new Error(`${store} 的 start_day 小于已上传菜单最小天数 ${menuBounds.minDay}`)
  }

  if (config.end_day > menuBounds.maxDay) {
    throw new Error(`${store} 的 end_day 超过已上传菜单最大天数 ${menuBounds.maxDay}`)
  }

  if (
    config.supplement_available_weekdays !== undefined &&
    (!Array.isArray(config.supplement_available_weekdays) ||
      config.supplement_available_weekdays.some((day) => !Number.isInteger(day) || day < 1 || day > 7))
  ) {
    throw new Error(`${store} 的 supplement_available_weekdays 非法`)
  }
}
