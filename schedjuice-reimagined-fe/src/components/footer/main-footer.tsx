import { Button, Separator, buttonVariants } from "@/components/primitives";
import Link from "next/link";
import { Facebook, Linkedin, Twitter } from "iconoir-react";

const MainFooter = () => {
  return (
    <footer className="md:px-32">
      <Separator className="my-2"></Separator>
      <div className="grid grid-cols-3 max-sm:grid-cols-1 gap-5 content-center px-2">
        <div>
          <p className="text-4xl">Schedjuice</p>
          <p>Use Schedjuice for your school today!</p>
          <Button className="mt-3" variant="secondary">
            Contact us
          </Button>
        </div>
        <div className=" underline ">
          <Link href={""}>
            <p>Terms of service</p>
          </Link>
          <Link href={""}>
            <p>Privacy policy</p>
          </Link>
          <Link href={""}>
            <p>About</p>
          </Link>
          <Link href={""}>
            <p>Contacts</p>
          </Link>
        </div>
        <div>
          <p>Follow us on social media</p>
          <div className="flex flex-wrap gap-3 mt-2">
            <Link href={"https://www.youtube.com/watch?v=dQw4w9WgXcQ"} target="_blank">
              <Button size="sm" variant="secondary">
                <Linkedin></Linkedin>
              </Button>
            </Link>
            <Link href={"https://www.youtube.com/watch?v=dQw4w9WgXcQ"} target="_blank">
              <Button size="sm" variant="secondary">
                <Facebook></Facebook>{" "}
              </Button>
            </Link>
            <Link href={"https://www.youtube.com/watch?v=dQw4w9WgXcQ"} target="_blank">
              <Button size="sm" variant="secondary">
                <Twitter></Twitter>
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default MainFooter;
