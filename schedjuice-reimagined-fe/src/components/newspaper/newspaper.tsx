import { cn } from "@/lib/utils";
import moment from "moment";
import { UnifrakturCook } from "next/font/google";
import ContentBox from "./context-box";
import Headline from "./headline";

const unicook = UnifrakturCook({
  subsets: ["latin"],
  display: "swap",
  weight: "700",
});
const NewsPaper = () => {
  const today = new Date();
  return (
    <div className=" bg-newspaper border border-gray-50">
      <div className="m-3">
        <h1 className={cn(unicook.className, "text-7xl")}>The Teacher Su Times</h1>
        <div
          className=" border-y-2 border-black "
          style={{
            fontFamily: "Times New Roman",
          }}
        >
          <p>{moment(today).format("dddd MMMM Do YYYY")}</p>
        </div>
      </div>
      <div
        style={{
          fontFamily: "Times New Roman",
        }}
      >
        <Headline
          title="New Classes Opening In August"
          subText="The School is opening new classes in August. Register now to secure your spot."
          paragraphs={[
            "Teacher Su International School is set to open new classes in August 2024. The school has exceptional reputation with hundreds of talented educators and thousands of students attending from withtin and without the country.",
            "The school has campuses in Yangon, the largest city in Myanmar, and in Naypyitaw, the capital.",
            "It offers a wide range of courses from kindergarten to high school. The school is known for its high academic standards and its commitment to excellence.",
          ]}
          imageCode="https://teachersucenter.com/images/hero-banner.png"
        ></Headline>
        <div className="grid grid-cols-3 gap-2 ">
          <ContentBox
            title="James Wins The Most Handsome Programmer Award, Again"
            subText="This is his 4th-year winning the award"
            paragraphs={[
              "Mr. Thiha Swan Htet, also known as James, has won the Most Handsome Programmer Award for the 4th year in a row. The award is given to the most handsome programmer in the world.",
              "James, a programmer at Teacher Su International School, is known for his good looks and charming personality. He is a favorite among students and teachers alike.",
              `"I drink a lot of water", James said when asked about his secret to staying handsome. `,
            ]}
            imageCaption="James"
            imageCode="https://avatars.githubusercontent.com/u/70014160?v=4"
          ></ContentBox>
          <ContentBox
            imageCode="/images/news-suconnect.png"
            title="New Features Coming To SuConnect"
            subText="SuConnect is getting new features around the end of July"
            paragraphs={[
              "SuConnect, the learning management system used by Teacher Su International School, is getting new features around the end of July. The promised features include a way to send multiple personalized emails to students and staff, a new text editor, a certificate generator, and an AI-powered fee-collection system.",
              `"I am working hard to make SuConnect the best LMS in the world", said the lead developer of SuConnect, Mr. James, "Though I want to release the new features earlier, my school assignments are keeping me busy."`,
              "The upcoming update is aimed to reduce the workload of assistant teachers. More details will be announce on The Teacher Su Times in the coming weeks."
            ]}
            imageCaption="The home page of SuConnect"
          ></ContentBox>
          <ContentBox
            title="Teacher Su Gives Birth To A Son"
            subText="Teacher Su gave birth to a healthy baby On July 1st, 2024."
            paragraphs={[
              "Teacher Su Htet Zaw, the founder of Teacher Su International School, gave birth to a healthy baby boy.",
              "The good news was announced by Dr. Aung Tun Tun, the school's managing director and teacher Su's husband. The family and the school community was overjoyed by the news.",
              `"Eternal love of my life, Ko Khant ", posted Dr. Aung Tun Tun on his Facebook account on the day of the birth.`
            ]}
            imageCode="/images/news-att-baby.jpeg"
            imageCaption="Proud father Dr. Aung Tun Tun and the baby"
          ></ContentBox>

        </div>
      </div>
    </div>
  );
};

export default NewsPaper;
