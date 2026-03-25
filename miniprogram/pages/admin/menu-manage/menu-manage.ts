interface MenuSummary {
  store: string;
  menuCount: number;
  minDay: number | null;
  maxDay: number | null;
  totalDishCount: number;
  updatedAt: string | null;
}

interface RotationConfig {
  menu_start_date: string;
  start_day: string;
  end_day: string;
  supplement_available_weekdays: number[];
}

interface ImportPreview {
  fileName: string;
  rowCount: number;
  dishCount: number;
  menuDayCount: number;
  minDay: number | null;
  maxDay: number | null;
  supplementDishCount: number;
  warnings: string[];
  errors: string[];
}

interface DishImageSummary {
  store: string;
  totalDishCount: number;
  matchedImageCount: number;
  placeholderDishCount: number;
}

interface DishImageItem {
  id: string;
  name: string;
  categoryLabel: string;
  fileID: string;
  hasImage?: boolean;
}

interface DishImageGroup {
  label: string;
  items: DishImageItem[];
}

interface DishImageGroupView extends DishImageGroup {
  expanded: boolean;
  visibleItems: DishImageItem[];
  hiddenCount: number;
}

interface DishImageCategoryStat {
  label: string;
  count: number | null;
  description: string;
}

const IMAGE_GROUP_PREVIEW_LIMIT = 6
const IMAGE_STATUS_CACHE_KEY = 'menu_manage_image_status_cache_v1'
const SUPPLEMENT_WEEKDAY_OPTIONS = [
  { label: '周一', value: 1 },
  { label: '周二', value: 2 },
  { label: '周三', value: 3 },
  { label: '周四', value: 4 },
  { label: '周五', value: 5 },
  { label: '周六', value: 6 },
  { label: '周日', value: 7 }
]

Page({
  _imageStatusRequestId: 0,
  data: {
    isReadOnly: false,
    loading: true,
    saving: false,
    parsingFile: false,
    importingFile: false,
    imageStatusLoading: false,
    storeVisible: false,
    dateVisible: false,
    selectedStore: '爱睦·梅溪湖店',
    uploadedFileID: '',
    uploadedFileName: '',
    storeOptions: [
      { label: '爱睦·梅溪湖店', value: '爱睦·梅溪湖店' },
      { label: '爱睦轻予·德思勤店', value: '爱睦轻予·德思勤店' }
    ],
    summary: {
      store: '',
      menuCount: 0,
      minDay: null,
      maxDay: null,
      totalDishCount: 0,
      updatedAt: null
    } as MenuSummary,
    configForm: {
      menu_start_date: '',
      start_day: '',
      end_day: '',
      supplement_available_weekdays: []
    } as RotationConfig,
    supplementWeekdayOptions: SUPPLEMENT_WEEKDAY_OPTIONS.map((item) => ({ ...item, selected: false })),
    importPreview: null as ImportPreview | null,
    dishImageSummary: {
      store: '',
      totalDishCount: 0,
      matchedImageCount: 0,
      placeholderDishCount: 0
    } as DishImageSummary,
    missingImageGroups: [] as DishImageGroupView[],
    imageCategoryStats: [
      { label: '菜品', count: null, description: '查看缺图菜品并上传或更新图片' },
      { label: '汤品', count: null, description: '查看缺图汤品并上传或更新图片' },
      { label: '高补品', count: null, description: '查看缺图高补品并上传或更新图片' }
    ] as DishImageCategoryStat[]
  },

  onLoad(options?: Record<string, string>) {
    const userInfo = wx.getStorageSync('userInfo') || {}
    const role = userInfo.role || userInfo.userType

    if (!['admin', 'staff'].includes(role)) {
      wx.reLaunch({
        url: '/pages/login/login'
      })
      return
    }

    const selectedStore = options?.store ? decodeURIComponent(options.store) : this.data.selectedStore
    this.setData({
      isReadOnly: role === 'staff',
      selectedStore
    })

    this.loadStoreData(selectedStore)
  },

  async loadStoreData(store: string) {
    this.setData({ loading: true })

    try {
      const [summaryRes, configRes] = await Promise.all([
        wx.cloud.callFunction({
          name: 'getStoreMenuSummary',
          data: {
            store,
            sessionToken: wx.getStorageSync('sessionToken')
          }
        }),
        wx.cloud.callFunction({
          name: 'getMenuRotationConfig',
          data: {
            store,
            sessionToken: wx.getStorageSync('sessionToken')
          }
        })
      ])

      const summaryResult = summaryRes.result as any
      const configResult = configRes.result as any

      if (!summaryResult?.success) {
        throw new Error(summaryResult?.message || '加载门店菜单概况失败')
      }

      if (!configResult?.success) {
        throw new Error(configResult?.message || '加载轮换配置失败')
      }

      const summary = summaryResult.summary || this.data.summary
      const config = configResult.config || null
      const configForm = this.buildConfigForm(summary, config)

      this.setData({
        summary,
        configForm,
        supplementWeekdayOptions: this.decorateSupplementWeekdayOptions(configForm.supplement_available_weekdays)
      })

      await this.loadDishImageStatus(store)
    } catch (error: any) {
      wx.showToast({
        title: error?.message || '加载失败',
        icon: 'none',
        duration: 2500
      })
    } finally {
      this.setData({ loading: false })
    }
  },

  async loadDishImageStatus(store: string) {
    const requestId = ++(this as any)._imageStatusRequestId
    this.resetDishImageStatusState(store, true)

    const cachedStatus = this.getCachedDishImageStatus(store)
    if (cachedStatus) {
      this.setData({
        dishImageSummary: cachedStatus.summary,
        imageCategoryStats: cachedStatus.categoryStats
      })
    }

    try {
      const imageStatusRes = await wx.cloud.callFunction({
        name: 'getStoreDishImageStatus',
        data: {
          store,
          sessionToken: wx.getStorageSync('sessionToken')
        }
      })

      const imageStatusResult = imageStatusRes.result as any
      if (!imageStatusResult?.success) {
        throw new Error(imageStatusResult?.message || '加载菜品图片状态失败')
      }

      const resolvedImageStatus = await this.resolveDishImageStatus(imageStatusResult.items || [], store)
      if (requestId !== (this as any)._imageStatusRequestId || store !== this.data.selectedStore) {
        return
      }

      const nextCategoryStats = this.buildImageCategoryStats(resolvedImageStatus.groupedMissingItems)
      const nextGroups = this.decorateImageGroups(resolvedImageStatus.groupedMissingItems)

      this.setData({
        dishImageSummary: resolvedImageStatus.summary,
        missingImageGroups: nextGroups,
        imageCategoryStats: nextCategoryStats,
        imageStatusLoading: false
      })

      this.setCachedDishImageStatus(store, {
        summary: resolvedImageStatus.summary,
        categoryStats: nextCategoryStats
      })
    } catch (error: any) {
      if (requestId !== (this as any)._imageStatusRequestId || store !== this.data.selectedStore) {
        return
      }

      console.error('加载菜品图片状态失败:', error)
      wx.showToast({
        title: error?.message || '加载图片状态失败',
        icon: 'none',
        duration: 2500
      })
    } finally {
      if (requestId === (this as any)._imageStatusRequestId && store === this.data.selectedStore) {
        this.setData({ imageStatusLoading: false })
      }
    }
  },

  showStorePicker() {
    this.setData({ storeVisible: true })
  },

  hideStorePicker() {
    this.setData({ storeVisible: false })
  },

  onStoreConfirm(e: any) {
    const value = Array.isArray(e.detail.value) ? e.detail.value[0] : e.detail.value
    this.setData({
      selectedStore: value,
      storeVisible: false
    })
    this.loadStoreData(value)
  },

  onStorePick() {},

  showDatePicker() {
    if (this.data.isReadOnly) return
    this.setData({ dateVisible: true })
  },

  hideDatePicker() {
    this.setData({ dateVisible: false })
  },

  onDateConfirm(e: any) {
    this.setData({
      'configForm.menu_start_date': this.normalizeDateValue(e.detail.value),
      dateVisible: false
    })
  },

  onFieldChange(e: any) {
    const field = e.currentTarget.dataset.field
    const value = e.detail.value
    this.setData({
      [`configForm.${field}`]: value
    })
  },

  async saveConfig() {
    if (this.data.isReadOnly) {
      return
    }

    const { selectedStore, configForm, summary } = this.data
    const startDay = Number(configForm.start_day)
    const endDay = Number(configForm.end_day)

    if (!configForm.menu_start_date) {
      wx.showToast({ title: '请选择菜单起始日期', icon: 'none' })
      return
    }

    if (!Number.isInteger(startDay) || startDay < 1) {
      wx.showToast({ title: '起始日必须大于等于 1', icon: 'none' })
      return
    }

    if (!Number.isInteger(endDay) || endDay < startDay) {
      wx.showToast({ title: '结束日必须大于等于起始日', icon: 'none' })
      return
    }

    if (summary.maxDay && endDay > summary.maxDay) {
      wx.showToast({
        title: `结束日超过已上传菜单最大天数 ${summary.maxDay}`,
        icon: 'none',
        duration: 2500
      })
      return
    }

    this.setData({ saving: true })

    try {
      const result = await wx.cloud.callFunction({
        name: 'saveMenuRotationConfig',
        data: {
          store: selectedStore,
          menu_start_date: configForm.menu_start_date,
          start_day: startDay,
          end_day: endDay,
          supplement_available_weekdays: configForm.supplement_available_weekdays,
          sessionToken: wx.getStorageSync('sessionToken')
        }
      })

      const payload = result.result as any
      if (!payload?.success) {
        throw new Error(payload?.message || '保存失败')
      }

      wx.showToast({
        title: '保存成功',
        icon: 'success'
      })

      this.loadStoreData(selectedStore)
    } catch (error: any) {
      wx.showToast({
        title: error?.message || '保存失败',
        icon: 'none',
        duration: 2500
      })
    } finally {
      this.setData({ saving: false })
    }
  },

  async chooseExcelFile() {
    if (this.data.isReadOnly || this.data.parsingFile || this.data.importingFile) {
      return
    }

    try {
      const chooseRes = await wx.chooseMessageFile({
        count: 1,
        type: 'file',
        extension: ['xlsx']
      })

      const tempFile = chooseRes.tempFiles?.[0]
      if (!tempFile) {
        return
      }

      const safeStore = this.data.selectedStore.replace(/[^\w\u4e00-\u9fa5-]/g, '_')
      const cloudPath = `menu_imports/${safeStore}/${Date.now()}_${tempFile.name}`

      this.setData({
        parsingFile: true,
        uploadedFileName: tempFile.name,
        importPreview: null
      })

      const uploadRes = await wx.cloud.uploadFile({
        cloudPath,
        filePath: tempFile.path
      })

      const parseRes = await wx.cloud.callFunction({
        name: 'parseStoreMenuExcel',
        data: {
          store: this.data.selectedStore,
          fileID: uploadRes.fileID,
          sessionToken: wx.getStorageSync('sessionToken')
        }
      })

      const payload = parseRes.result as any
      if (!payload?.success) {
        throw new Error(payload?.message || '解析失败')
      }

      this.setData({
        uploadedFileID: uploadRes.fileID,
        importPreview: payload.preview
      })

      wx.showToast({
        title: '文件解析完成',
        icon: 'success'
      })
    } catch (error: any) {
      wx.showToast({
        title: error?.message || '上传解析失败',
        icon: 'none',
        duration: 2500
      })
    } finally {
      this.setData({ parsingFile: false })
    }
  },

  async confirmImport() {
    if (this.data.isReadOnly || !this.data.uploadedFileID || this.data.importingFile) {
      return
    }

    if (this.data.importPreview?.errors?.length) {
      wx.showToast({
        title: '请先修复 Excel 错误再导入',
        icon: 'none',
        duration: 2500
      })
      return
    }

    this.setData({ importingFile: true })

    try {
      const result = await wx.cloud.callFunction({
        name: 'confirmStoreMenuImport',
        data: {
          store: this.data.selectedStore,
          fileID: this.data.uploadedFileID,
          sessionToken: wx.getStorageSync('sessionToken')
        }
      })

      const payload = result.result as any
      if (!payload?.success) {
        throw new Error(payload?.message || '导入失败')
      }

      wx.showToast({
        title: '导入成功',
        icon: 'success'
      })

      this.loadStoreData(this.data.selectedStore)
      this.setData({
        importPreview: null,
        uploadedFileID: '',
        uploadedFileName: ''
      })
    } catch (error: any) {
      wx.showToast({
        title: error?.message || '导入失败',
        icon: 'none',
        duration: 2500
      })
    } finally {
      this.setData({ importingFile: false })
    }
  },

  formatUpdatedAt(value: string | null) {
    if (!value) return '暂无'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return '暂无'
    const month = `${date.getMonth() + 1}`.padStart(2, '0')
    const day = `${date.getDate()}`.padStart(2, '0')
    const hours = `${date.getHours()}`.padStart(2, '0')
    const minutes = `${date.getMinutes()}`.padStart(2, '0')
    return `${month}-${day} ${hours}:${minutes}`
  },

  formatPreviewDayRange(preview: ImportPreview | null) {
    if (!preview || preview.minDay === null || preview.maxDay === null) {
      return '暂无'
    }
    return `${preview.minDay} - ${preview.maxDay}`
  },

  normalizeDateValue(value: string | number | Date | null | undefined) {
    if (!value) return ''
    const raw = String(value)
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      return raw
    }

    const date = new Date(raw)
    if (Number.isNaN(date.getTime())) {
      return raw.substring(0, 10)
    }

    const year = date.getFullYear()
    const month = `${date.getMonth() + 1}`.padStart(2, '0')
    const day = `${date.getDate()}`.padStart(2, '0')
    return `${year}-${month}-${day}`
  },

  buildConfigForm(summary: MenuSummary, config: Record<string, any> | null) {
    const fallbackStart = summary.minDay !== null ? String(summary.minDay) : ''
    const fallbackEnd = summary.maxDay !== null ? String(summary.maxDay) : ''

    return {
      menu_start_date: this.normalizeDateValue(config?.menu_start_date || ''),
      start_day: config?.start_day ? String(config.start_day) : fallbackStart,
      end_day: config?.end_day ? String(config.end_day) : fallbackEnd,
      supplement_available_weekdays: Array.isArray(config?.supplement_available_weekdays)
        ? config.supplement_available_weekdays
        : [2, 5]
    }
  },

  toggleSupplementWeekday(e: any) {
    if (this.data.isReadOnly) {
      return
    }

    const day = Number(e.currentTarget.dataset.day)
    if (!Number.isInteger(day)) {
      return
    }

    const currentDays = [...(this.data.configForm.supplement_available_weekdays || [])]
    const nextDays = currentDays.includes(day)
      ? currentDays.filter((item) => item !== day)
      : [...currentDays, day].sort((left, right) => left - right)

    this.setData({
      'configForm.supplement_available_weekdays': nextDays,
      supplementWeekdayOptions: this.decorateSupplementWeekdayOptions(nextDays)
    })
  },

  decorateSupplementWeekdayOptions(selectedDays: number[]) {
    return SUPPLEMENT_WEEKDAY_OPTIONS.map((item) => ({
      ...item,
      selected: selectedDays.includes(item.value)
    }))
  },

  formatMissingCount(group: DishImageGroup) {
    return `${group.items.length} 道`
  },

  async resolveDishImageStatus(items: DishImageItem[], store: string) {
    if (!items.length) {
      return {
        summary: {
          store,
          totalDishCount: 0,
          matchedImageCount: 0,
          placeholderDishCount: 0
        } as DishImageSummary,
        groupedMissingItems: [] as DishImageGroup[]
      }
    }

    const fileStatusMap = new Map<string, boolean>()
    const chunkSize = 20

    for (let index = 0; index < items.length; index += chunkSize) {
      const chunk = items.slice(index, index + chunkSize)
      try {
        const result = await wx.cloud.getTempFileURL({
          fileList: chunk.map(item => item.fileID)
        })

        ;(result.fileList || []).forEach((file: any) => {
          fileStatusMap.set(file.fileID, file.status === 0 && Boolean(file.tempFileURL))
        })
      } catch (error) {
        chunk.forEach((item) => {
          fileStatusMap.set(item.fileID, false)
        })
      }
    }

    const resolvedItems = items.map((item) => ({
      ...item,
      hasImage: Boolean(fileStatusMap.get(item.fileID))
    }))

    const missingItems = resolvedItems.filter(item => !item.hasImage)

    return {
      summary: {
        store,
        totalDishCount: resolvedItems.length,
        matchedImageCount: resolvedItems.length - missingItems.length,
        placeholderDishCount: missingItems.length
      } as DishImageSummary,
      groupedMissingItems: this.groupDishItems(missingItems)
    }
  },

  groupDishItems(items: DishImageItem[]) {
    const groups: Record<string, DishImageItem[]> = {
      菜品: [],
      汤品: [],
      高补品: []
    }

    items.forEach((item) => {
      const key = groups[item.categoryLabel] ? item.categoryLabel : '菜品'
      groups[key].push(item)
    })

    return Object.keys(groups)
      .map((label) => ({
        label,
        items: groups[label]
      }))
      .filter(group => group.items.length > 0)
  },

  decorateImageGroups(groups: DishImageGroup[]) {
    return groups.map((group, index) => {
      const expanded = index === 0
      const visibleItems = expanded ? group.items : group.items.slice(0, IMAGE_GROUP_PREVIEW_LIMIT)
      return {
        ...group,
        expanded,
        visibleItems,
        hiddenCount: Math.max(group.items.length - visibleItems.length, 0)
      }
    })
  },

  toggleMissingGroup(e: any) {
    const label = e.currentTarget.dataset.label
    const nextGroups = (this.data.missingImageGroups || []).map((group) => {
      if (group.label !== label) {
        return group
      }

      const expanded = !group.expanded
      const visibleItems = expanded ? group.items : group.items.slice(0, IMAGE_GROUP_PREVIEW_LIMIT)

      return {
        ...group,
        expanded,
        visibleItems,
        hiddenCount: Math.max(group.items.length - visibleItems.length, 0)
      }
    })

    this.setData({
      missingImageGroups: nextGroups
    })
  },

  openImageCategoryPage(e: any) {
    const category = e.currentTarget.dataset.category
    if (!category) return

    wx.navigateTo({
      url: `/pages/admin/dish-image-manage/dish-image-manage?store=${encodeURIComponent(this.data.selectedStore)}&category=${encodeURIComponent(category)}`
    })
  },

  buildImageCategoryStats(groups: DishImageGroup[]) {
    const descriptions: Record<string, string> = {
      菜品: '查看缺图菜品并上传或更新图片',
      汤品: '查看缺图汤品并上传或更新图片',
      高补品: '查看缺图高补品并上传或更新图片'
    }

    return ['菜品', '汤品', '高补品'].map((label) => {
      const group = groups.find(item => item.label === label)
      return {
        label,
        count: group?.items?.length || 0,
        description: descriptions[label]
      }
    })
  },

  getEmptyDishImageSummary(store: string): DishImageSummary {
    return {
      store,
      totalDishCount: 0,
      matchedImageCount: 0,
      placeholderDishCount: 0
    }
  },

  getEmptyImageCategoryStats(): DishImageCategoryStat[] {
    return [
      { label: '菜品', count: null, description: '查看缺图菜品并上传或更新图片' },
      { label: '汤品', count: null, description: '查看缺图汤品并上传或更新图片' },
      { label: '高补品', count: null, description: '查看缺图高补品并上传或更新图片' }
    ]
  },

  resetDishImageStatusState(store: string, loading = false) {
    this.setData({
      imageStatusLoading: loading,
      dishImageSummary: this.getEmptyDishImageSummary(store),
      missingImageGroups: [],
      imageCategoryStats: this.getEmptyImageCategoryStats()
    })
  },

  getCachedDishImageStatus(store: string) {
    try {
      const cache = wx.getStorageSync(IMAGE_STATUS_CACHE_KEY) || {}
      const cached = cache[store]
      if (!cached?.timestamp || !cached?.summary || !cached?.categoryStats) {
        return null
      }

      const age = Date.now() - cached.timestamp
      if (age > 5 * 60 * 1000) {
        return null
      }

      return {
        summary: cached.summary as DishImageSummary,
        categoryStats: cached.categoryStats as DishImageCategoryStat[]
      }
    } catch (error) {
      console.error('读取图片状态缓存失败:', error)
      return null
    }
  },

  setCachedDishImageStatus(store: string, data: { summary: DishImageSummary; categoryStats: DishImageCategoryStat[] }) {
    try {
      const cache = wx.getStorageSync(IMAGE_STATUS_CACHE_KEY) || {}
      cache[store] = {
        ...data,
        timestamp: Date.now()
      }
      wx.setStorageSync(IMAGE_STATUS_CACHE_KEY, cache)
    } catch (error) {
      console.error('写入图片状态缓存失败:', error)
    }
  }
})
