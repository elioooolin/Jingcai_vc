// 餐单数据导入云函数
const cloud = require('wx-server-sdk')

cloud.init({
  env: 'cloud1-1gbzoqv6ad653efc'
})

const db = cloud.database()

// 云函数入口函数
exports.main = async (event, context) => {
  const { action, data, store, sessionToken } = event
  
  try {
    const currentUser = await getCurrentUser({ sessionToken })
    if (!currentUser || currentUser.role !== 'admin') {
      return {
        success: false,
        message: '需要管理员权限'
      }
    }

    switch (action) {
      case 'importDishes':
        return await importDishes(data, store || data?.store)
      case 'importMenus':
        return await importMenus(data, store || data?.store)
      case 'updateSysConfig':
        return await updateSysConfig(data, store || data?.store)
      case 'clearMenuData':
        return await clearMenuData(store || data?.store)
      default:
        return { success: false, message: '未知操作' }
    }
  } catch (error) {
    console.error('导入失败:', error)
    return {
      success: false,
      error: error.message
    }
  }
}

async function getCurrentUser({ sessionToken } = {}) {
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

// 导入菜品数据
async function importDishes(dishes, store) {
  console.log('开始导入菜品数据，数量:', dishes.length)
  
  const batchSize = 20 // 每批处理20条
  const batches = []
  
  for (let i = 0; i < dishes.length; i += batchSize) {
    const batch = dishes.slice(i, i + batchSize)
    batches.push(batch)
  }
  
  let successCount = 0
  let failCount = 0
  
  for (const batch of batches) {
    try {
      const promises = batch.map(dish => 
        db.collection('dishes').add({
          data: {
            ...dish,
            ...(store ? { store } : {}),
            created_at: new Date(),
            status: 'active'
          }
        })
      )
      
      await Promise.all(promises)
      successCount += batch.length
      console.log(`批次导入成功，本批数量: ${batch.length}`)
    } catch (error) {
      console.error('批次导入失败:', error)
      failCount += batch.length
    }
  }
  
  return {
    success: true,
    message: `菜品导入完成，成功: ${successCount}，失败: ${failCount}`,
    successCount,
    failCount
  }
}

// 导入菜单配置
async function importMenus(menus, store) {
  console.log('开始导入菜单配置，数量:', menus.length)
  
  let successCount = 0
  let failCount = 0
  
  for (const menu of menus) {
    try {
      // 将菜品名称转换为菜品ID
      const processedMenu = await processMenuWithDishIds(menu, store)
      
      await db.collection('daily_menus').add({
        data: {
          ...processedMenu,
          ...(store ? { store } : {}),
          created_at: new Date()
        }
      })
      successCount++
      console.log(`第${menu.day}天菜单导入成功`)
    } catch (error) {
      console.error(`第${menu.day}天菜单导入失败:`, error)
      failCount++
    }
  }
  
  return {
    success: true,
    message: `菜单配置导入完成，成功: ${successCount}，失败: ${failCount}`,
    successCount,
    failCount
  }
}

// 将菜品名称转换为菜品ID
async function processMenuWithDishIds(menu, store) {
  const processedMenu = {
    day: menu.day,
    meals: {}
  }
  
  for (const [mealType, mealData] of Object.entries(menu.meals)) {
    processedMenu.meals[mealType] = {}
    
    for (const [categoryName, categoryData] of Object.entries(mealData)) {
      // 根据菜品名称查找菜品ID
      const dishIds = []
      for (const dishName of categoryData.dish_names) {
        try {
          let dishQuery

          if (store) {
            dishQuery = await db.collection('dishes').where({
              name: dishName,
              store
            }).get()
          } else {
            dishQuery = await db.collection('dishes').where({
              name: dishName
            }).get()
          }
          
          if (dishQuery.data.length > 0) {
            dishIds.push(dishQuery.data[0]._id)
          } else {
            console.warn(`找不到菜品: ${dishName}${store ? ` (${store})` : ''}`)
          }
        } catch (error) {
          console.error(`查询菜品失败: ${dishName}`, error)
        }
      }
      
      processedMenu.meals[mealType][categoryName] = {
        selection_rule: categoryData.selection_rule,
        required_count: categoryData.required_count,
        dishes: dishIds
      }
    }
  }
  
  return processedMenu
}

// 更新系统配置
async function updateSysConfig(config, store) {
  console.log('更新系统配置:', config)
  
  try {
    // 先查询是否存在配置
    const whereCondition = store ? {
      key: 'menu_start_date',
      store
    } : {
      key: 'menu_start_date'
    }

    const existing = await db.collection('sysinfo').where(whereCondition).get()
    
    if (existing.data.length > 0) {
      // 更新现有配置
      await db.collection('sysinfo').doc(existing.data[0]._id).update({
        data: {
          value: config.menu_start_date,
          updated_at: new Date()
        }
      })
    } else {
      // 创建新配置
      await db.collection('sysinfo').add({
        data: {
          key: 'menu_start_date',
          value: config.menu_start_date,
          ...(store ? { store } : {}),
          description: '14天菜单循环的起始日期',
          created_at: new Date()
        }
      })
    }
    
    return {
      success: true,
      message: '系统配置更新成功'
    }
  } catch (error) {
    throw new Error('系统配置更新失败: ' + error.message)
  }
}

// 清空菜单数据（用于重新导入）
async function clearMenuData(store) {
  console.log('开始清空菜单数据', store ? `- 门店: ${store}` : '')
  
  try {
    // 清空菜品
    const dishesResult = store
      ? await db.collection('dishes').where({ store }).get()
      : await db.collection('dishes').get()
    if (dishesResult.data.length > 0) {
      const dishPromises = dishesResult.data.map(item => 
        db.collection('dishes').doc(item._id).remove()
      )
      await Promise.all(dishPromises)
    }
    
    // 清空菜单配置
    const menusResult = store
      ? await db.collection('daily_menus').where({ store }).get()
      : await db.collection('daily_menus').get()
    if (menusResult.data.length > 0) {
      const menuPromises = menusResult.data.map(item => 
        db.collection('daily_menus').doc(item._id).remove()
      )
      await Promise.all(menuPromises)
    }
    
    return {
      success: true,
      message: `清空完成，删除菜品: ${dishesResult.data.length}，删除菜单: ${menusResult.data.length}${store ? `，门店: ${store}` : ''}`
    }
  } catch (error) {
    throw new Error('清空数据失败: ' + error.message)
  }
}
