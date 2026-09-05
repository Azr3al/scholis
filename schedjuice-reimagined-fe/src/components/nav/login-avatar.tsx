import { Avatar } from "@/components/primitives";
import { useUser } from "@/hooks/useUser";
import { accountType } from "@/types/user";
import { getCookie } from "cookies-next";
import { useEffect, useState } from "react";

const LoginAvatar: React.FC = () => {

  const {user} = useUser()
  return (
    // <Avatar>
    //   <AvatarImage src="https://github.com/ninnroot.png" />
    //   
    // </Avatar>
    <>
      {user ? (
        <p className=" max-w-fit">logged in with: {user.email} </p>
      ) : (
        <p>login</p>
      )}
    </>
  );
};

export default LoginAvatar;
