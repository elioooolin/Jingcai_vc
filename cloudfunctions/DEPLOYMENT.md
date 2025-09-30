# 云函数部署指南

本文档说明需要部署的云函数和部署顺序。

## 需要部署的云函数

### 1. getTcmData（已有，需更新）
- **功能**: 获取用户的中医处方记录
- **更新内容**: 返回 `tongueImageFileId` 用于删除操作
- **部署**: ✅ 必须部署

### 2. addTcmRx（新增）
- **功能**: 添加中医处方记录和上传舌苔图
- **部署**: ✅ 必须部署

### 3. deleteTcmRx（新增）
- **功能**: 删除中医处方记录和舌苔图
- **部署**: ✅ 必须部署

## 部署步骤

### 方法一：使用微信开发者工具（推荐）

1. 打开微信开发者工具
2. 在左侧文件树中找到 `cloudfunctions` 文件夹
3. 按以下顺序部署：

#### 第一步：部署 addTcmRx
```
右键 cloudfunctions/addTcmRx → 上传并部署：云端安装依赖
```
等待部署完成...

#### 第二步：部署 deleteTcmRx
```
右键 cloudfunctions/deleteTcmRx → 上传并部署：云端安装依赖
```
等待部署完成...

#### 第三步：更新 getTcmData
```
右键 cloudfunctions/getTcmData → 上传并部署：云端安装依赖
```
等待部署完成...

### 方法二：使用命令行

```bash
# 进入项目根目录
cd /Users/sophieyuge/WeChatProjects/lovemoon_vc

# 部署 addTcmRx
cd cloudfunctions/addTcmRx
npm install
# 使用微信开发者工具命令行工具部署
wx-cloud deploy addTcmRx

# 部署 deleteTcmRx
cd ../deleteTcmRx
npm install
wx-cloud deploy deleteTcmRx

# 更新 getTcmData
cd ../getTcmData
npm install
wx-cloud deploy getTcmData
```

## 验证部署

### 1. 检查云函数列表
- 打开微信开发者工具
- 点击"云开发"控制台
- 进入"云函数"页面
- 确认以下函数存在且状态为"已部署"：
  - ✅ addTcmRx
  - ✅ deleteTcmRx
  - ✅ getTcmData

### 2. 测试功能
1. **测试添加处方**:
   - 进入管理端客户列表
   - 点击某个客户的"处方"按钮
   - 点击"上传中医处方"
   - 填写信息并提交
   - 检查是否成功保存

2. **测试删除处方**:
   - 进入处方列表
   - 点击某个处方的"删除"按钮
   - 确认删除
   - 检查是否成功删除

3. **测试查看处方**:
   - 刷新处方列表
   - 检查舌苔图是否正常显示
   - 点击舌苔图查看大图

## 常见问题

### Q1: 部署时提示"云函数不存在"
**A**: 确保在微信开发者工具中打开了正确的项目，并且已经开启了云开发功能。

### Q2: 部署后调用失败
**A**: 
1. 检查云开发环境ID是否正确
2. 在 `miniprogram/app.ts` 中确认云开发初始化配置
3. 查看云函数日志排查错误

### Q3: 权限错误
**A**: 确保：
1. 云函数已正确部署
2. 数据库权限规则正确配置
3. 云存储权限规则正确配置

### Q4: 删除功能提示"STORAGE_EXCEED_AUTHORITY"
**A**: 这是使用云函数前的错误，部署 `deleteTcmRx` 云函数后应该解决。

## 数据库权限配置

确保 `tcm_rx` 集合的权限设置为：
- 管理员：所有权限
- 用户：仅读取自己的数据

## 云存储权限配置

确保云存储路径 `{userId}/tongue/` 的权限设置为：
- 云函数：完整权限（读写删除）
- 用户：仅读取

## 部署后清单

完成部署后，请确认：
- [ ] addTcmRx 云函数已部署
- [ ] deleteTcmRx 云函数已部署
- [ ] getTcmData 云函数已更新
- [ ] 添加处方功能正常
- [ ] 删除处方功能正常
- [ ] 查看处方功能正常
- [ ] 舌苔图显示正常
