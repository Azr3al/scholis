"use client";

const NotFound: React.FC = () => {
  return (
    <div className="flex flex-col items-center justify-center">
      <p className="flex h-[40vh] w-[100vw] items-center justify-center text-center text-2xl text-text-primary">
        :( <br /> The page you are looking for does not exist!
      </p>
    </div>
  );
};

export default NotFound;
