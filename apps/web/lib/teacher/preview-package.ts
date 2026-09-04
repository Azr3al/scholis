import type { TestDetail } from '@/lib/api';
import { testPackageSchema, type TestPackage } from '@scholis/schema';

/** Strip answer keys from an authoring view for read-only student preview. */
export const testDetailToPreviewPackage = (test: TestDetail): TestPackage =>
  testPackageSchema.parse({
    testId: test.id,
    code: test.code,
    title: test.title,
    timeLimitMinutes: test.timeLimitMinutes,
    allowNavigation: test.allowNavigation,
    testTakingMode: test.testTakingMode,
    introBody: test.introBody,
    outroBody: test.outroBody,
    sections: test.sections,
    questions: test.questions,
  });
