import { useEffect, useRef, useState } from 'react';

/**
 * 使用说明：界面上只留最精简的提示，详细规则全部集中在这个浮层里。
 *
 * 用原生 <dialog> + showModal()——自带遮罩、Esc 关闭、焦点陷阱与顶层渲染，
 * 不需要额外依赖，也不用手写 z-index 叠层。
 */
export default function HelpPanel() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDialogElement>(null);

  // open 是唯一真源。Esc 关闭时 dialog 会自己触发 close 事件，这里同步回状态，
  // 否则下次点按钮时 open 仍是 true，effect 不会再调 showModal。
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    else if (!open && el.open) el.close();
  }, [open]);

  return (
    <>
      <button className="tbtn" onClick={() => setOpen(true)} title="手势、快捷键与各种规则的完整说明">
        使用说明
      </button>

      {/* 点遮罩关闭：原生 dialog 没这个行为，补一下。
          内容区 padding 为 0 且撑满，所以点在 dialog 自身元素上就等同于点遮罩。 */}
      <dialog
        ref={ref}
        className="help-dialog"
        onClose={() => setOpen(false)}
        onClick={(e) => {
          if (e.target === ref.current) setOpen(false);
        }}
      >
        <div className="help-head">
          <span className="panel-title">使用说明</span>
          <span className="toolbar-spacer" />
          <button className="tbtn" onClick={() => setOpen(false)}>
            关闭
          </button>
        </div>

        <div className="help-body">
          <h3>画布</h3>
          <ul>
            <li>
              <strong>左键拖空白 = 框选</strong>，选框盖住的节点一起选中；<kbd>Shift</kbd> 或 <kbd>Ctrl</kbd> + 点节点 = 加选；点空白 = 取消选中
            </li>
            <li>
              <strong>右键按住拖动 = 平移画布</strong>（中键拖动也可以）；键盘 <kbd>↑</kbd> <kbd>↓</kbd>{' '}
              <kbd>←</kbd> <kbd>→</kbd> 也能平移，每按一次挪 60px
            </li>
            <li>滚轮 = 缩放画布（10% ~ 200%）</li>
            <li>
              <strong>双击节点 = 就地改标题</strong>（Enter 确认，Esc 取消）；鼠标停在节点上会显示它的正文
            </li>
            <li>
              <strong>右键轻点节点 = 弹菜单</strong>（新建子节点 / 新建同级节点 / 锁定位置 / 删除节点）；
              <strong>按住右键拖动 = 平移画布</strong>，不会弹菜单
            </li>
          </ul>

          <h3>连线与层级</h3>
          <ul>
            <li>
              从节点<strong>下边</strong>的锚点拉出 → <strong>父子线</strong>（灰色，决定大纲的层级）
            </li>
            <li>
              从节点<strong>左右</strong>的锚点拉出 → <strong>自由联想线</strong>（粉色，只是视觉关联，不参与层级计算）
            </li>
            <li>上边锚点只能被连入，不能从它拉出——同一根线只允许一种解释</li>
            <li>
              <strong>点灰色父子线 = 断开</strong>：子节点变成独立节点，位置和内容一字不动
            </li>
            <li>点粉色联想线 = 删掉这条联想</li>
            <li>节点面板的「父节点」下拉也能改层级；「设为中心主题」会把当前所有顶层节点挂到它下面</li>
            <li>
              「一键整理位置」= 按父子层级重摆成自上而下的树：<strong>只改视觉位置，不改父子关系</strong>；锁定的节点不动，可以用 Ctrl+Z 撤回
            </li>
          </ul>

          <h3>节点面板</h3>
          <ul>
            <li>选中节点时才出现，点空白即消失（用工具栏的「隐藏节点面板」可以彻底关掉它）</li>
            <li>标题 / 正文 / 标签（逗号分隔）/ 颜色 / 形状 / 宽高都可以改</li>
            <li>
              宽高留空 = 用默认 220 × 84；选中节点后也能直接拖四角、四边缩放（80 × 40 ~ 800 × 800），一次缩放只记一条历史
            </li>
            <li>
              <strong>锁定位置</strong>后节点右下角会出现一个小锁：不能再拖动和缩放，但内容照常可以编辑
            </li>
            <li>「折叠后代」会把它的所有后代暂时从画布上收起来（大纲里也一并收起）</li>
          </ul>

          <h3>快捷键</h3>
          <ul className="help-keys">
            <li>
              <kbd>Tab</kbd> 在选中节点下新建子节点
            </li>
            <li>
              <kbd>Enter</kbd> 新建同级节点
            </li>
            <li>
              <kbd>Delete</kbd> / <kbd>Backspace</kbd> 删除选中的节点
            </li>
            <li>
              <kbd>Ctrl</kbd>+<kbd>Z</kbd> 撤销
            </li>
            <li>
              <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd> 或 <kbd>Ctrl</kbd>+<kbd>Y</kbd> 重做
            </li>
            <li>
              <kbd>Esc</kbd> 取消选中
            </li>
            <li>方向键平移画布</li>
          </ul>
          <p className="help-note">在输入框里打字时，上面这些快捷键都不生效，不会抢你的按键。</p>

          <h3>AI 面板</h3>
          <ul>
            <li>
              <strong>AI 只写文本</strong>：不建节点、不连线、不整理结构，也不改动你没让它改的东西
            </li>
            <li>生成结果先进入「预览」，你可以直接改，点「确认写入」之后才会落进画布</li>
            <li>「写新节点」= 挂到当前选中节点下面；「扩展选中节点」= 追加到正文末尾，不覆盖已有内容</li>
            <li>接口设置填 OpenAI 兼容的 Base URL、模型、API Key，全部只保存在本机浏览器</li>
          </ul>

          <h3>数据与导出</h3>
          <ul>
            <li>所有内容自动存在本机浏览器里，关掉页面再回来还在</li>
            <li>
              <strong>导出图片</strong> = 按全部可见节点的范围截图，与当前缩放、平移无关
            </li>
            <li>导出 Markdown = 单向导出，不提供反向导入</li>
            <li>导出 JSON = 完整存档文件</li>
            <li>「新建图」= 清空全部节点重新开始，误点了可以 Ctrl+Z 找回</li>
          </ul>
        </div>
      </dialog>
    </>
  );
}
