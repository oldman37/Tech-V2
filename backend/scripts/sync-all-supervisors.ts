import 'dotenv/config';
import { execSync } from 'child_process';

interface SyncStep {
  name: string;
  script: string;
  description: string;
  required: boolean;
}

const syncSteps: SyncStep[] = [
  {
    name: 'Location Supervisors',
    script: 'scripts/sync-supervisors.ts',
    description: 'Syncs director-level supervisors from Entra ID groups to locations',
    required: true
  },
  {
    name: 'User Supervisors',
    script: 'scripts/assign-user-supervisors.ts',
    description: 'Assigns building-level supervisors to individual users based on office location',
    required: true
  }
];

async function runStep(step: SyncStep): Promise<boolean> {
  console.log('\n' + '='.repeat(80));
  console.log(`🚀 Running: ${step.name}`);
  console.log(`   ${step.description}`);
  console.log('='.repeat(80) + '\n');

  try {
    execSync(`npx tsx ${step.script}`, {
      stdio: 'inherit',
      cwd: process.cwd()
    });
    
    console.log(`\n✅ ${step.name} completed successfully`);
    return true;
  } catch (error) {
    console.error(`\n❌ ${step.name} failed:`, error);
    return false;
  }
}

async function syncAll() {
  const startTime = Date.now();
  
  console.log('\n' + '█'.repeat(80));
  console.log('🔄 SUPERVISOR SYNC - MASTER ORCHESTRATOR');
  console.log('█'.repeat(80));
  console.log(`\nStarting full supervisor sync at ${new Date().toLocaleString()}`);
  console.log(`Running ${syncSteps.length} sync steps...\n`);

  const results: { step: string; success: boolean; }[] = [];

  for (const step of syncSteps) {
    const success = await runStep(step);
    results.push({ step: step.name, success });

    if (!success && step.required) {
      console.error('\n🛑 Required step failed. Stopping sync process.');
      break;
    }
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  // Summary
  console.log('\n' + '█'.repeat(80));
  console.log('📊 SYNC SUMMARY');
  console.log('█'.repeat(80) + '\n');

  results.forEach(result => {
    const icon = result.success ? '✅' : '❌';
    console.log(`${icon} ${result.step}: ${result.success ? 'SUCCESS' : 'FAILED'}`);
  });

  const allSuccess = results.every(r => r.success);
  
  console.log('\n' + '█'.repeat(80));
  console.log(`${allSuccess ? '✨ ALL SYNCS COMPLETED SUCCESSFULLY' : '⚠️  SOME SYNCS FAILED'}`);
  console.log(`Total time: ${duration}s`);
  console.log(`Completed at ${new Date().toLocaleString()}`);
  console.log('█'.repeat(80) + '\n');

  process.exit(allSuccess ? 0 : 1);
}

syncAll();
