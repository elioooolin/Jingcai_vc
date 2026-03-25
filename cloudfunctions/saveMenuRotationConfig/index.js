const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event) => {
  const { store, menu_start_date, start_day, end_day, supplement_available_weekdays } = event

  try {
    if (!store || !menu_start_date) {
      return {
        success: false,
        error: 'MISSING_REQUIRED_FIELDS',
        message: '缺少必填字段'
      }
    }

    const currentUser = await getCurrentUser(event)
    if (!currentUser || currentUser.role !== 'admin') {
      return {
        success: false,
        error: 'FORBIDDEN',
        message: '需要管理员权限'
      }
    }

    const normalizedStartDay = Number(start_day)
    const normalizedEndDay = Number(end_day)
    const normalizedSupplementWeekdays = Array.isArray(supplement_available_weekdays)
      ? Array.from(
          new Set(
            supplement_available_weekdays
              .map((day) => Number(day))
              .filter((day) => Number.isInteger(day) && day >= 1 && day <= 7)
          )
        ).sort((left, right) => left - right)
      : []

    if (!Number.isInteger(normalizedStartDay) || normalizedStartDay < 1) {
      return {
        success: false,
        error: 'INVALID_START_DAY',
        message: 'start_day 必须是大于等于 1 的整数'
      }
    }

    if (!Number.isInteger(normalizedEndDay) || normalizedEndDay < normalizedStartDay) {
      return {
        success: false,
        error: 'INVALID_END_DAY',
        message: 'end_day 必须大于等于 start_day'
      }
    }

    const menuBounds = await getMenuDayBounds(store)
    if (!menuBounds) {
      return {
        success: false,
        error: 'MENU_NOT_FOUND',
        message: `${store} 尚未上传菜单，无法配置轮换规则`
      }
    }

    if (normalizedStartDay < menuBounds.minDay) {
      return {
        success: false,
        error: 'INVALID_START_DAY',
        message: `start_day 小于已上传菜单最小天数 ${menuBounds.minDay}`
      }
    }

    if (normalizedEndDay > menuBounds.maxDay) {
      return {
        success: false,
        error: 'INVALID_END_DAY',
        message: `end_day 超过已上传菜单最大天数 ${menuBounds.maxDay}`
      }
    }

    const saveData = {
      store,
      menu_start_date,
      start_day: normalizedStartDay,
      end_day: normalizedEndDay,
      supplement_available_weekdays: normalizedSupplementWeekdays,
      status: 'active',
      updatedAt: new Date(),
      updatedBy: currentUser.name || currentUser.phone || '管理员'
    }

    const existing = await db.collection('menu_rotation_configs').where({ store }).get()
    if (existing.data.length > 0) {
      await db.collection('menu_rotation_configs').doc(existing.data[0]._id).update({
        data: saveData
      })
    } else {
      await db.collection('menu_rotation_configs').add({
        data: saveData
      })
    }

    return {
      success: true,
      message: '门店轮换配置保存成功',
      config: saveData
    }
  } catch (error) {
    console.error('保存门店菜单轮换配置失败:', error)
    return {
      success: false,
      error: 'SERVER_ERROR',
      message: error.message || '保存门店菜单轮换配置失败'
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
    maxDay: days[days.length - 1]
  }
}
