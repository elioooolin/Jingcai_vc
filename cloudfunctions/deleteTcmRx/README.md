# deleteTcmRx 云函数

## 功能说明
删除中医处方记录和对应的舌苔图。

## 为什么需要云函数删除？
- ❌ 前端直接删除云存储文件会遇到 `STORAGE_EXCEED_AUTHORITY` 权限错误
- ❌ 前端直接删除数据库记录会遇到 `document.remove:fail` 权限错误
- ✅ 云函数拥有完整的数据库和云存储操作权限

## 部署步骤

### 1. 安装依赖
```bash
cd cloudfunctions/deleteTcmRx
npm install
```

### 2. 上传部署
在微信开发者工具中：
- 右键点击 `cloudfunctions/deleteTcmRx` 文件夹
- 选择"上传并部署：云端安装依赖"

## 接口参数

### 输入参数
```javascript
{
  rxId: string,    // 处方记录ID（必填）
  userId: string,  // 用户ID（必填，用于构造云存储路径）
  week: number     // 周数（必填，用于构造云存储路径）
}
```

### 返回结果
```javascript
{
  success: boolean,    // 是否成功
  message: string,     // 提示信息
  data: {
    fileDeleted: boolean  // 舌苔图是否成功删除
  }
}
```

## 功能特性
- ✅ 完整的数据库和云存储操作权限
- ✅ 使用统一格式的云存储路径删除舌苔图
  - 路径格式：`${userId}/tongue/week_${week}.JPG`
- ✅ 容错处理：即使图片删除失败也会继续删除数据库记录
- ✅ 完整的日志记录，方便调试

## 删除流程
1. 使用 `userId` 和 `week` 构造云存储路径
2. 删除云存储中的舌苔图
3. 删除数据库中的处方记录
4. 返回删除结果

## 云存储路径规则
舌苔图统一存储在固定格式路径：
```
${userId}/tongue/week_${week}.JPG
```
例如：`5d47df3168dabcf100c86b035323c67f/tongue/week_1.JPG`

## 错误处理
- 缺少必要参数：返回错误提示
- 舌苔图删除失败：记录日志但继续删除数据库记录
- 数据库删除失败：返回错误信息
