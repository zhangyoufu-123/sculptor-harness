/**
 * Error Transparency — when API fails, tell the user honestly.
 * No silent fallback. Give them a lighter path forward.
 */

export const ERROR_TRANSPARENCY_MESSAGES = {
  apiError: [
    '⚠️ 刚刚脑子卡了一下（API暂时没响应）。我们来换个简单的方式——',
    '⚠️ 信号不太好，让我换个思路——',
    '⚠️ 刚刚打了个磕巴。不如我们换个方式——',
  ],
  contextLost: ['我刚才好像走神了。让我们回到你之前说的——', '抱歉，我刚才的连接断了。你刚刚说到——'],
  fallbackQuestion: '你现在最想记下来的，到底是什么感觉或画面？',

  /**
   * Pick a random transparent error message + fallback question.
   */
  apiRecovery(): string {
    const prefix = this.apiError[Math.floor(Math.random() * this.apiError.length)];
    return `${prefix}\n\n${this.fallbackQuestion}`;
  },

  contextRecovery(lastTopic: string): string {
    const prefix = this.contextLost[Math.floor(Math.random() * this.contextLost.length)];
    return `${prefix}"${lastTopic}"——我们继续？`;
  },
};
