import Image from "next/image";

interface HeadlineProps {
  title: string;
  subText: string;
  paragraphs: string[];
  imageCode: string;
}

const Headline: React.FC<HeadlineProps> = ({
  title,
  subText,
  paragraphs,
  imageCode,
}) => {
  return (
    <div

      //   className=" border-y-2 border-black "
      style={{
        fontFamily: "Times New Roman",
      }}
    >
      <h1 className="text-5xl font-bold mb-1">{title}</h1>
      <div><p className="italic text-2xl">{subText}</p></div>
      <div className="p-2 ">
        <Image
        unoptimized
          alt="image"
          src={imageCode}
          className="w-[100%] h-[300px] object-cover"
          width={700}
          height={300}
          quality={100}
        ></Image>
        
      </div>
      <div className="text-start grid grid-cols-3 gap-2 p-2">
      {paragraphs.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
    </div>
  );
};
export default Headline;
