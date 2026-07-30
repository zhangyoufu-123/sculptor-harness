import { FullPipelineRunner } from '../harness';

export async function runWorkflow(
  idea: string,
  options: { debug?: boolean; verbose?: boolean },
): Promise<void> {
  console.log(`\n🚀 启动全流程测试\n`);
  console.log(`主题: ${idea}\n`);

  const runner = new FullPipelineRunner(options.debug || false);
  const result = await runner.run(idea);

  console.log('\n' + '='.repeat(50));
  console.log('📊 流程结果');
  console.log('='.repeat(50));
  console.log(`项目ID:   ${result.projectId}`);
  console.log(`状态:     ${result.success ? '✅ 成功' : '❌ 失败'}`);
  console.log(`阶段:     ${result.phases.join(' → ')}`);
  console.log(`耗时:     ${(result.duration / 1000).toFixed(1)}s`);
  console.log(`事件数:   ${result.events}`);
  console.log(`决策数:   ${result.decisions}`);

  if (result.errors.length > 0) {
    console.log(`\n❌ 错误:`);
    for (const err of result.errors) {
      console.log(`   - ${err}`);
    }
  }

  // Use verbose flag for additional detail
  if (options.verbose) {
    console.log(`\n📝 详细日志:`);
    console.log(`   项目ID: ${result.projectId}`);
    console.log(`   阶段明细: ${JSON.stringify(result.phases)}`);
  }

  console.log('');
}
