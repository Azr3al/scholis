import type { AuthoredQuestion } from '@/lib/api';
import { plainText } from '@/lib/take/rich-text';
import { isShortManuallyGraded } from '@scholis/schema';

export const questionTypeLabel = (question: AuthoredQuestion): string => {
  if (question.type === 'short') return 'Short answer';
  if (question.type === 'essay') return 'Essay';
  return question.settings.selection === 'multi' ? 'Multiple choice' : 'Single choice';
};

export const QuestionAnswerKey = ({ question }: { question: AuthoredQuestion }) => {
  if (question.type === 'choice') {
    const correct = question.options.filter((option) => option.isCorrect);
    return (
      <div className="flex flex-col gap-2">
        <p className="text-xs font-medium text-muted-foreground">Correct option(s)</p>
        {correct.length === 0 ? (
          <p className="text-sm text-muted-foreground">No correct option marked.</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {correct.map((option) => (
              <li
                key={option.id}
                className="rounded-md border border-primary/30 bg-primary/5 px-2.5 py-1.5"
              >
                {plainText(option.body) || 'Untitled option'}
              </li>
            ))}
          </ul>
        )}
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">All options</summary>
          <ul className="mt-2 flex flex-col gap-1">
            {question.options.map((option) => (
              <li
                key={option.id}
                className={
                  option.isCorrect
                    ? 'rounded-md border border-primary/30 bg-primary/5 px-2.5 py-1.5'
                    : 'rounded-md border border-border px-2.5 py-1.5'
                }
              >
                {plainText(option.body) || 'Untitled option'}
                {option.isCorrect && (
                  <span className="ml-2 text-xs text-muted-foreground">· correct</span>
                )}
              </li>
            ))}
          </ul>
        </details>
      </div>
    );
  }

  if (question.type === 'short') {
    if (isShortManuallyGraded(question.settings)) {
      return (
        <p className="text-sm text-muted-foreground">
          Marked manually — there is no fixed answer key.
        </p>
      );
    }

    const caseNote =
      question.settings.caseSensitive
        ? 'Matching is case-sensitive.'
        : 'Matching ignores letter case.';

    return (
      <div className="flex flex-col gap-2">
        <p className="text-xs font-medium text-muted-foreground">Accepted answer(s)</p>
        {question.acceptedAnswers.length === 0 ? (
          <p className="text-sm text-muted-foreground">No accepted answers yet.</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {question.acceptedAnswers.map((answer) => (
              <li
                key={answer}
                className="rounded-md border border-primary/30 bg-primary/5 px-2.5 py-1.5"
              >
                {answer}
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">{caseNote}</p>
      </div>
    );
  }

  return (
    <p className="text-sm text-muted-foreground">
      Essays are marked manually — there is no fixed answer key.
    </p>
  );
};
