const cloud = require('wx-server-sdk')

cloud.init({
  env: 'cloud1-1gbzoqv6ad653efc'
})

const db = cloud.database()

exports.main = async (event, context) => {
  const { sessionToken } = event

  try {
    if (!sessionToken) {
      return {
        success: false,
        error: 'INVALID_PARAMS',
        message: '缺少 sessionToken'
      }
    }

    const sessionQuery = await db.collection('user_sessions').where({
      sessionToken,
      isActive: true
    }).get()

    if (sessionQuery.data.length === 0) {
      return {
        success: true,
        message: '会话已失效'
      }
    }

    await db.collection('user_sessions').doc(sessionQuery.data[0]._id).update({
      data: {
        isActive: false,
        updatedAt: new Date()
      }
    })

    return {
      success: true,
      message: '退出登录成功'
    }
  } catch (error) {
    console.error('退出会话失败:', error)
    return {
      success: false,
      error: 'SERVER_ERROR',
      message: '服务器错误，请稍后重试'
    }
  }
}
