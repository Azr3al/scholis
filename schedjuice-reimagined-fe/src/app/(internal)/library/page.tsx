import { PageContainer } from "@/components/layout/page-container";
import BookCard from "@/components/library/book-card";
import { Input } from "@/components/primitives";

const LibraryPage = () => {
  return (
    <PageContainer width="wide" className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <div
          className="relative h-[350px] w-full bg-cover bg-center bg-no-repeat"
          style={{
            backgroundImage: `linear-gradient(0deg, rgba(251, 252, 254, 1), rgba(0,0,0,0.2) 85%), url('/images/default-library-cover.jpeg')`,
          }}
        >
          <div className="absolute top-[5%] left-0 w-full text-center">
            <h1 className="text-3xl font-bold">
              <span className="text-red-600">Teacher Su</span>{" "}
              <span className="text-blue-600">E-Library</span>
            </h1>
            <p>ပညာ သမာ၊ အာဘာ နတ္ထိ</p>
          </div>
          <div className="absolute top-[95%] left-0 flex w-full items-center justify-center">
            <Input
              className="w-96 max-w-[90vw] rounded-full bg-surface max-sm:w-52"
              placeholder="search by book title or author"
            />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-5 pt-10">
        <div className="mb-10 flex items-center justify-evenly gap-3 text-center max-sm:flex-col">
          <div className="flex w-52 flex-col gap-3 rounded-md p-8 shadow-md">
            <p className="text-4xl font-bold">3</p>
            <p>physical libraries</p>
          </div>
          <div className="flex w-52 flex-col gap-3 rounded-md p-8 shadow-md">
            <p className="text-4xl font-bold">325</p>
            <p>books</p>
          </div>
          <div className="flex w-52 flex-col gap-3 rounded-md p-8 shadow-md">
            <p className="text-4xl font-bold">6452</p>
            <p>users</p>
          </div>
        </div>

        <div className="relative rounded-md border border-border p-3 max-sm:p-1">
          <h3 className="absolute top-[-15px] left-5 bg-surface px-3 text-xl font-bold">
            Editors&apos; Choices
          </h3>
          <div className="flex flex-col gap-3 p-5 max-sm:p-2">
            <BookCard id="1" animationDelay={1} />
            <BookCard id="2" animationDelay={2} />
            <BookCard id="3" animationDelay={3} />
            <BookCard id="40" animationDelay={4} />
          </div>
        </div>
        <div className="prose">
          <h2>Library rules and regulations</h2>
          <ol>
            <li>Books can be borrowed for a maximum of 2 weeks.</li>
            <li>Books can be renewed for another 2 weeks.</li>
            <li>Damage to books will result in a fine.</li>
            <li>Lost books must be replaced or paid for.</li>
            <li>Overdue books will result in a fine.</li>
          </ol>
          <h2>Contact</h2>
          <p>
            For any inquiries or assistance, please contact the librarian or the
            academic dean. Office hours are from 9 am to 5 pm.
          </p>
          <ul>
            <li>Campus 1 librarian: 09xxxxx</li>
            <li>Campus 2 librarian: 09xxxxx</li>
            <li>Campus 3 librarian: 09xxxxx</li>
            <li>Academic Dean: 09xxxx</li>
          </ul>
        </div>
      </div>
    </PageContainer>
  );
};

export default LibraryPage;
