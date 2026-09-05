import { Button, Dialog, Skeleton, buttonVariants } from "@/components/primitives";
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "@/components/images/carousel-ui";
import { cn } from "@/lib/utils";
import Image from "next/image";
import { useEffect, useState } from "react";
import { Loader } from "../form/loader";
import { ZoomIn } from "iconoir-react";
import { getDimensions } from "@/helpers/image";

interface IImageCarouselProps {
  images: string[];
  width?: number;
  height?: number;
  showControls?: boolean;
}

const ImageCarousel: React.FC<IImageCarouselProps> = ({
  images,
  width = 300,
  height = 300,
  showControls = true,
}) => {
  const [dialogImageIndex, setDialogImageIndex] = useState<number>(0);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isImageLoading, setIsImageLoading] = useState(true);

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex justify-center items-center">
        <Dialog.Root open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Popup className=" max-w-screen max-h-screen  overflow-scroll p-0 m-0">
            {
              <>
                <Image
                  className=" p-10 max-sm:p-0"
                  unoptimized
                  alt="image"
                  src={images[dialogImageIndex]}
                  width={window.innerWidth}
                  height={window.innerHeight}
                  quality={100}
                  onLoadStart={() => setIsImageLoading(true)}
                  onLoadingComplete={() => setIsImageLoading(false)}
                ></Image>
              </>
            }
          </Dialog.Popup>
      </Dialog.Portal>
        </Dialog.Root>

        <Carousel className="w-full max-w-md relative">
          <CarouselContent className="">
            {images.map((i, index) => (
              <CarouselItem
                key={i}
                className="m-0 p-0 flex items-end justify-center relative group"
              >
                <div className="flex items-end justify-center  group-hover:bg-gray-500 w-fit peer-hover:bg-gray-500">
                  <Image
                    onClick={() => {
                      setDialogImageIndex(index);
                      setIsDialogOpen(true);
                    }}
                    unoptimized
                    alt="image"
                    src={i}
                    className={cn({
                      "hover:opacity-30  peer-hover:opacity-30 group-hover:opacity-30 transition-all duration-150 ease-in-out cursor-pointer object-cover":
                        true,
                    })}
                    width={width}
                    height={height}
                  ></Image>
                </div>
                <Button
                  onClick={() => {
                    setDialogImageIndex(index);
                    setIsDialogOpen(true);
                  }}
                  variant={"ghost"}
                  className="hidden peer group-hover:block absolute text-white hover:bg-transparent mx-auto w-fit left-0 right-0"
                >
                  <ZoomIn></ZoomIn>
                </Button>
              </CarouselItem>
            ))}
          </CarouselContent>
          {showControls && images.length > 1 && (
            <div className="max-sm:hidden">
              <CarouselPrevious />
              <CarouselNext />
            </div>
          )}
        </Carousel>
      </div>
      {showControls && images.length > 1 ? (
        <div>
          <p className=" italic">Swipe to move between images</p>
        </div>
      ) : null}
    </div>
  );
};

export default ImageCarousel;
