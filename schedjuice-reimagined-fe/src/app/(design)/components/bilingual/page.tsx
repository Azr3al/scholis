// src/app/(design)/components/bilingual/page.tsx
export default function BilingualPage() {
  return (
    <div className="max-w-2xl space-y-8 text-base">
      <section className="space-y-2">
        <h2 className="font-serif text-2xl">Burmese-only paragraph</h2>
        <p>
          ကျောင်းသားများသည် စာမေးပွဲကို ဖြေဆိုပြီးနောက် ရလဒ်များကို စောင့်ဆိုင်းနေကြသည်။
          ဆရာမသည် အတန်းထဲတွင် တိတ်ဆိတ်စွာ စာသင်ကြားနေသည်။
        </p>
      </section>
      <section className="space-y-2">
        <h2 className="font-serif text-2xl">Mixed script, one line</h2>
        <p>အောင်ဇေယျ submitted Quiz 4 — graded 18/20 by ဆရာ Daw Hla.</p>
      </section>
      <section className="space-y-2">
        <h2 className="font-serif text-2xl">Burmese in a button &amp; a table cell</h2>
        <button
          type="button"
          className="rounded-md bg-accent px-4 py-2 text-accent-foreground"
        >
          အတည်ပြုမည်
        </button>
        <table className="mt-3 w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-border-strong">
              <th className="py-2 text-sm text-text-muted">Name</th>
              <th className="py-2 text-sm text-text-muted">Course</th>
            </tr>
          </thead>
          <tbody>
            <tr className="h-[52px] border-b border-border">
              <td>သီရိ ကျော်</td>
              <td>အင်္ဂလိပ်စာ — Level 3</td>
            </tr>
          </tbody>
        </table>
      </section>
      <section className="space-y-2">
        <h2 className="font-serif text-2xl">Handwriting quote</h2>
        <p className="font-hand text-hand text-brand">
          “Keep going” — ဆက်လက်ကြိုးစားပါ
        </p>
      </section>
      <section className="space-y-2">
        <h2 className="font-serif text-2xl">Myanmar-digit currency</h2>
        <p className="font-mono text-mono-base">ကျပ် ၁၂၃,၄၅၀.၀၀ / 123,450.00 MMK</p>
      </section>
      <section className="space-y-2">
        <h2 className="font-serif text-2xl">Mixed-script form label</h2>
        <label className="block text-sm text-text-secondary" htmlFor="sj-demo">
          ကျောင်းသားအမည် (Student name)
        </label>
        <input
          id="sj-demo"
          className="mt-1 w-full rounded-md border border-border bg-surface-elevated px-3 py-2"
          placeholder="အမည် / Name"
        />
      </section>
    </div>
  );
}
