Component({
	options: {
		multipleSlots: true
	},
	properties: {
		/**
		 * {
		 *	 key: 0,        // 要插入的位置
		 *	 fixed: true,   // 额外节点是否固定
		 *	 slot: "test"   // 额外节点展示的所使用的 slot
		 * }
		 */
		// 插入正常节点之前的额外节点
		beforeExtraNodes: {
			type: Array,
			value: []
		},
		// 插入正常节点之后的额外节点
		afterExtraNodes: {
			type: Array,
			value: []
		},
		// 数据源
		listData: {
			type: Array,
			value: []
		},
		// 列数
		columns: {
			type: Number,
			value: 1
		},
		// 顶部高度
		topSize: {
			type: Number,
			value: 0
		},
		// 底部高度
		bottomSize: {
			type: Number,
			value: 0
		},
		// 页面滚动高度
		scrollTop: {
			type: Number,
			value: 0
		},
	},
	data: {
		/* 未渲染数据 */
		windowHeight: 0, // 视窗高度
		platform: '', // 平台信息
		realTopSize: 0, // 计算后顶部高度实际值
		realBottomSize: 0, // 计算后底部高度实际值
		itemDom: { // 每一项 item 的 dom 信息, 由于大小一样所以只存储一个
			width: 0,
			height: 0,
			left: 0,
			top: 0
		},
		itemWrapDom: { // 整个拖拽区域的 dom 信息
			width: 0,
			height: 0,
			left: 0,
			top: 0
		},
		startTouch: { // 初始触摸点信息
			pageX: 0,
			pageY: 0,
			identifier: 0
		},
		startTranX: 0, // 当前激活元素的初始 X轴 偏移量
		startTranY: 0, // 当前激活元素的初始 Y轴 偏移量
		preOriginKey: -1, // 前一次排序时候的起始 key 值

		/* 渲染数据 */
		list: [],
		cur: -1, // 当前激活的元素
		curZ: -1, // 当前激活的元素, 用于控制激活元素z轴显示
		tranX: 0, // 当前激活元素的 X轴 偏移量
		tranY: 0, // 当前激活元素的 Y轴 偏移量
		itemWrapHeight: 0, // 动态计算父级元素高度
		dragging: false, // 是否在拖拽中
		itemTransition: false, // item 变换是否需要过渡动画, 首次渲染不需要
	},
	methods: {
		/**
		 * 封装自定义事件
		 * @param list 当前渲染的数据
		 * @param type 事件类型
		 */
		triggerCustomEvent(list, type) {
			let _list = [], listData = [];

			list.forEach((item) => {
				_list[item.key] = item;
			});

			_list.forEach((item) => {
				if (!item.isExtra) {
					listData.push(item.data);
				}
			});

			this.triggerEvent(type, {listData: listData});
		},
		/**
		 * 点击每一项后触发事件
		 */
		itemClick(e) {
			let {index} = e.currentTarget.dataset;
			let list = this.data.list;
			let currentItem = list[index];

			if (!currentItem.isExtra) {
				let _list = [];

				list.forEach((item) => {
					_list[item.key] = item;
				});

				let currentKey = -1;

				for (let i = 0, len = _list.length; i < len; i++) {
					let item = _list[i];
					if (!item.isExtra) {
						currentKey++;
					}
					if (item.key === currentItem.key) {
						break;
					}
				}

				this.triggerEvent('click', {
					key: currentKey,
					data: currentItem.data,
				});
			}
		},
		/**
		 * 长按触发移动排序
		 */
		longPress(e) {
			// 获取触摸点信息
			let startTouch = e.changedTouches[0];
			if (!startTouch) return;

			// 如果是固定项则返回
			let index = e.currentTarget.dataset.index;
			if (this.isFixed(index)) return;

			// 防止多指触发 drag 动作, 如果已经在 drag 中则返回, touchstart 事件中有效果
			if (this.data.dragging) return;
			this.setData({dragging: true});

			let {
					pageX: startPageX,
					pageY: startPageY
				} = startTouch,
				{
					platform,
					itemDom,
					itemWrapDom
				} = this.data,
				startTranX = 0,
				startTranY = 0;

			if (this.data.columns > 1) {
				// 多列的时候计算X轴初始位移, 使 item 水平中心移动到点击处
				startTranX = startPageX - itemDom.width / 2 - itemWrapDom.left;
			}
			// 计算Y轴初始位移, 使 item 垂直中心移动到点击处
			startTranY = startPageY - itemDom.height / 2 - itemWrapDom.top;

			this.data.startTouch = startTouch;
			this.data.startTranX = startTranX;
			this.data.startTranY = startTranY;
			this.setData({
				cur: index,
				curZ: index,
				tranX: startTranX,
				tranY: startTranY,
			});

			if (platform !== "devtools") wx.vibrateShort();
		},
		touchMove(e) {
			// 获取触摸点信息
			let currentTouch = e.changedTouches[0];
			if (!currentTouch) return;

			if (!this.data.dragging) return;

			let {
					windowHeight,
					realTopSize,
					realBottomSize,
					itemDom,
					startTouch,
					startTranX,
					startTranY,
					preOriginKey
				} = this.data,
				{
					pageX: startPageX,
					pageY: startPageY,
					identifier: startId
				} = startTouch,
				{
					pageX: currentPageX,
					pageY: currentPageY,
					identifier: currentId,
					clientY: currentClientY
				} = currentTouch;

			// 如果不是同一个触发点则返回
			if (startId !== currentId) return;

			// 通过 当前坐标点, 初始坐标点, 初始偏移量 来计算当前偏移量
			let tranX = currentPageX - startPageX + startTranX,
				tranY = currentPageY - startPageY + startTranY;

			// 单列时候X轴初始不做位移
			if (this.data.columns === 1) tranX = 0;

			// 到顶到底自动滑动
			if (currentClientY > windowHeight - itemDom.height - realBottomSize) {
				// 当前触摸点pageY + item高度 - (屏幕高度 - 底部固定区域高度)
				wx.pageScrollTo({
					scrollTop: currentPageY + itemDom.height - (windowHeight - realBottomSize),
					duration: 300
				});
			} else if (currentClientY < itemDom.height + realTopSize) {
				// 当前触摸点pageY - item高度 - 顶部固定区域高度
				wx.pageScrollTo({
					scrollTop: currentPageY - itemDom.height - realTopSize,
					duration: 300
				});
			}

			// 设置当前激活元素偏移量
			this.setData({
				tranX: tranX,
				tranY: tranY
			});

			// 获取 originKey 和 endKey
			let originKey = parseInt(e.currentTarget.dataset.key),
				endKey = this.calculateMoving(tranX, tranY);

			// 如果是固定 item 则 return
			if (this.isFixed(endKey)) return;

			// 防止拖拽过程中发生乱序问题
			if (originKey === endKey || preOriginKey === originKey) return;
			this.data.preOriginKey = originKey;

			// 触发排序
			this.insert(originKey, endKey);
		},
		touchEnd() {
			if (!this.data.dragging) return;
			this.triggerCustomEvent(this.data.list, "sortend");
			this.clearData();
		},
		/**
		 * 根据当前的手指偏移量计算目标key
		 */
		calculateMoving(tranX, tranY) {
			let {itemDom} = this.data;

			let rows = Math.ceil(this.data.list.length / this.data.columns) - 1,
				i = Math.round(tranX / itemDom.width),
				j = Math.round(tranY / itemDom.height);

			i = i > (this.data.columns - 1) ? (this.data.columns - 1) : i;
			i = i < 0 ? 0 : i;
			j = j < 0 ? 0 : j;
			j = j > rows ? rows : j;

			let endKey = i + this.data.columns * j;
			endKey = endKey >= this.data.list.length ? this.data.list.length - 1 : endKey;

			return endKey
		},
		/**
		 * 根据起始key和目标key去重新计算每一项的新的key
		 */
		insert(origin, end) {
			this.setData({itemTransition: true});
			let list;
			if (origin < end) { // 正序拖动
				list = this.data.list.map((item) => {
					if (item.fixed) return item;
					if (item.key > origin && item.key <= end) {
						item.key = this.l2r(item.key - 1, origin);
					} else if (item.key === origin) {
						item.key = end;
					}
					return item;
				});
				this.getPosition(list);
			} else if (origin > end) { // 倒序拖动
				list = this.data.list.map((item) => {
					if (item.fixed) return item;
					if (item.key >= end && item.key < origin) {
						item.key = this.r2l(item.key + 1, origin);
					} else if (item.key === origin) {
						item.key = end;
					}
					return item;
				});
				this.getPosition(list);
			}
		},
		/**
		 * 正序拖动 key 值和固定项判断逻辑
		 */
		l2r(key, origin) {
			if (key === origin) return origin;
			if (this.data.list[key].fixed) {
				return this.l2r(key - 1, origin);
			} else {
				return key;
			}
		},
		/**
		 * 倒序拖动 key 值和固定项判断逻辑
		 */
		r2l(key, origin) {
			if (key === origin) return origin;
			if (this.data.list[key].fixed) {
				return this.r2l(key + 1, origin);
			} else {
				return key;
			}
		},
		/**
		 * 根据排序后 list 数据进行位移计算
		 */
		getPosition(data, vibrate = true) {
			let {platform} = this.data;

			let list = data.map((item, index) => {
				item.x = item.key % this.data.columns;
				item.y = Math.floor(item.key / this.data.columns);
				return item;
			});
			this.setData({list: list});

			if (!vibrate) return;
			if (platform !== "devtools") wx.vibrateShort();

			this.triggerCustomEvent(list, "change");
		},
		/**
		 * 判断是否是固定的 item
		 */
		isFixed(key) {
			let list = this.data.list;
			if (list && list[key] && list[key].fixed) return 1;
			return 0;
		},
		/**
		 * 清除参数
		 */
		clearData() {
			this.setData({
				preOriginKey: -1,
				dragging: false,
				cur: -1,
				tranX: 0,
				tranY: 0
			});
			// 延迟清空
			setTimeout(() => {
				this.setData({
					curZ: -1,
				})
			}, 300)
		},
		/**
		 *  初始化获取 dom 信息
		 */
		initDom() {
			let {windowWidth, windowHeight, platform} = wx.getSystemInfoSync();
			let remScale = (windowWidth || 375) / 375,
				realTopSize = this.data.topSize * remScale / 2,
				realBottomSize = this.data.bottomSize * remScale / 2;

			this.data.windowHeight = windowHeight;
			this.data.platform = platform;
			this.data.realTopSize = realTopSize;
			this.data.realBottomSize = realBottomSize;

			this.createSelectorQuery().select(".item").boundingClientRect((res) => {
				let rows = Math.ceil(this.data.list.length / this.data.columns);

				this.data.itemDom = res;
				this.setData({
					itemWrapHeight: rows * res.height,
				});

				this.createSelectorQuery().select(".item-wrap").boundingClientRect((res) => {
					this.data.itemWrapDom = res;
					this.data.itemWrapDom.top += this.data.scrollTop
				}).exec();
			}).exec();
		},
		/**
		 *  初始化函数
		 *  {listData, columns, topSize, bottomSize} 参数改变需要重新调用初始化方法
		 */
		init() {
			this.clearData();
			this.setData({itemTransition: false});
			// 避免获取不到节点信息报错问题
			if (this.data.listData.length === 0) {
				this.setData({list: [], itemWrapHeight: 0});
				return;
			}

			let {listData, beforeExtraNodes, afterExtraNodes} = this.data;
			let _listData = [];

			// 遍历数据源增加扩展项, 以用作排序使用
			listData.forEach((item, index) => {
				beforeExtraNodes.forEach((_item, _index) => {
					if (_item.key === index) {
						_listData.push({
							id: _item.dragId,
							x: 0,
							y: 0,
							slot: _item.slot,
							isExtra: true,
							fixed: _item.fixed,
							data: {}
						});
					}
				});
				_listData.push({
					id: item.dragId,
					x: 0,
					y: 0,
					slot: "",
					isExtra: false,
					fixed: item.fixed,
					data: item
				});
				afterExtraNodes.forEach((_item, _index) => {
					if (_item.key === index) {
						_listData.push({
							id: _item.dragId,
							x: 0,
							y: 0,
							slot: _item.slot,
							isExtra: true,
							fixed: _item.fixed,
							data: {}
						});
					}
				});
			});

			let list = _listData.map((item, index) => {
				return {
					key: index,
					...item
				};
			});

			this.getPosition(list, false);
			// 异步加载数据时候, 延迟执行 initDom 方法, 防止基础库 2.7.1 版本及以下无法正确获取 dom 信息
			setTimeout(() => this.initDom(), 0);
		}
	},
	ready() {
		this.init();
	}
});
