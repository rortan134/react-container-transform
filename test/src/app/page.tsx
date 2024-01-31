"use client";

import * as Dialog from "@radix-ui/react-dialog";
import * as React from "react";
import * as ContainerTransform from "../../../src";

export default function HomePage() {
    const [isActive, setIsActive] = React.useState(false);

    return (
        <main className="relative flex min-h-[calc(100vh-3rem)] flex-col items-end justify-end p-12">
            <ContainerTransform.Root active={isActive}>
                <Dialog.Root onOpenChange={setIsActive}>
                    <ContainerTransform.Trigger>
                        <Dialog.Trigger className="relative inline-flex h-11 items-center justify-center rounded-[150px] bg-blue-200 px-3 text-sm font-semibold text-black">
                            OPEN
                        </Dialog.Trigger>
                    </ContainerTransform.Trigger>
                    <ContainerTransform.Portal>
                        <Dialog.Portal>
                            <Dialog.Overlay className="fixed inset-0 z-40 bg-black opacity-75" />
                            <ContainerTransform.Content>
                                <Dialog.Content className="absolute left-1/2 top-1/2 z-50 w-64 -translate-x-1/2 -translate-y-1/2 rounded-[24px] bg-neutral-900 p-5 text-white focus:outline-none">
                                    <Dialog.Title className="truncate text-xl font-semibold">
                                        Container Transform
                                    </Dialog.Title>
                                    <Dialog.Description className="mt-1.5 text-sm opacity-80">
                                        Lorem ipsum dolor sit amet consectetur.
                                    </Dialog.Description>
                                    <p className="mt-4 text-sm">
                                        Lorem ipsum dolor sit amet, consectetur
                                        adipisicing elit. Esse ex exercitationem
                                        maiores voluptatibus. Lorem, ipsum
                                        dolor.
                                    </p>
                                    <div className="mt-8 flex items-center justify-between">
                                        <Dialog.Close className="h-[2.15rem] rounded-full bg-red-500 px-3 text-sm font-semibold text-black">
                                            Close
                                        </Dialog.Close>
                                        <Dialog.Close className="h-[2.15rem] rounded-full bg-blue-300 px-3 text-sm font-semibold text-black">
                                            Confirm
                                        </Dialog.Close>
                                    </div>
                                </Dialog.Content>
                            </ContainerTransform.Content>
                        </Dialog.Portal>
                    </ContainerTransform.Portal>
                </Dialog.Root>
            </ContainerTransform.Root>
        </main>
    );
}
