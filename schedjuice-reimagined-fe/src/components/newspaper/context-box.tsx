import Image from "next/image";

interface ContentBoxProps {
  title: string;
  subText: string;
  paragraphs: string[];
  imageCode?: string;
  imageCaption?: string;
}
const ContentBox: React.FC<ContentBoxProps> = ({
  title,
  subText,
  paragraphs,
  imageCode,
  imageCaption,
}) => {
  return (
    <div className="">
      <h1 className=" text-3xl italic">{title}</h1>
      <div className="flex items-center justify-center my-2">
        <div className=" border-y border-black ">
          <p className=" text-xl italic">{subText}</p>
        </div>
      </div>
      {imageCode && (
        <div className="p-2 ">
          <Image
          unoptimized
            alt="image"
            src={imageCode}
            className="w-[100%] h-[300px] object-cover"
            width={300}
            height={300}
            quality={100}
          ></Image>
          <p className="italic ">{imageCaption}</p>
        </div>
      )}
      <div className="text-start space-y-1 leading-5  p-2">
        {paragraphs.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
    </div>
  );
};

export default ContentBox;
