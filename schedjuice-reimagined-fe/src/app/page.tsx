import BirthdayAlert from "@/components/birthday/birthday-alert";
import Countdown from "@/components/countdown/countdown";

import NewsPaper from "@/components/newspaper/newspaper";
import { getTenantOnServer } from "@/helpers/tenant";

export default async function Home() {
  const { tenant } = await getTenantOnServer();

  return (
    <>
      <div className="flex h-screen border-collapse overflow-hidden">
        <main className="flex-1 pt-16 pb-1 no-scrollbar relative max-w-(--breakpoint-xl) mx-auto h-screen  overflow-x-hidden px-3 max-sm:px-1 text-center">
          <div className="space-y-3">
            <h1 className="text-7xl mt-20 bg-linear-to-r dark:from-cyan-600 dark:to-slate-600 from-cyan-300 to-gray-400 bg-clip-text text-transparent font-bold min-h-[90px]">
              {tenant?.name}
            </h1>
            <div className="space-y-3">
              <p>{tenant?.tagline}</p>

              {/* <div className="space-x-3 mb-10">
              <Link href={"/dummy"}>
                <Button>Get Started</Button>
              </Link>
              <Link href={"/dummy"}>
                <Button variant="secondary">Documentation</Button>
              </Link>
            </div> */}
            </div>
            <BirthdayAlert></BirthdayAlert>

            {tenant?.domain_url &&
              ["suconnect.teachersucenter.com", "suconnect.thiha.net"].includes(
                tenant?.domain_url
              ) && (
                <div className="space-y-5">
                  {/* <Countdown title="Ceritfy Is Coming Back On James' Birthday!" date={new Date(2024,6,17)}></Countdown> */}
                  <NewsPaper></NewsPaper>
                </div>
              )}
          </div>
        </main>
      </div>
    </>
  );
}
