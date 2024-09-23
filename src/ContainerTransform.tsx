import { Slot, Slottable } from "@radix-ui/react-slot";
import { AnimatePresence, motion, LayoutGroup } from "framer-motion";
import * as React from "react";
import ReactDOM from "react-dom";
import { createContextScope } from "./utils/createContext";
import { useComposedRefs } from "./utils/useComposedRefs";
import { useControllableState } from "./utils/useControllableState";

type Scope<C = any> = { [scopeName: string]: React.Context<C>[] } | undefined;

const EASINGS = {
    emphasized: [0.4, 0.0, 0.2, 1] as const, // begin and end
    emphasized_decelerate: [0.05, 0.7, 0.1, 1] as const, // for elements entering the screen
    emphasized_accelerate: [0.3, 0.0, 0.8, 0.15] as const, // for elements exiting the screen
};
const DURATIONS = {
    emphasized: 0.3,
    emphasized_decelerate: 0.4,
    emphasized_accelerate: 0.25,
    emphasized_outgoing: 0.25,
};

const visibleOnlyStyles = {
    pointerEvents: "none",
    position: "absolute",
    zIndex: 999,
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
} satisfies React.CSSProperties;

const STR_UNDEFINED = "undefined";
const isWindowDefined = typeof window != STR_UNDEFINED;
const isServer = !isWindowDefined || "Deno" in globalThis;

const useIsomorphicLayoutEffect = isServer ? React.useEffect : React.useLayoutEffect;

/* -------------------------------------------------------------------------------------------------
 * ContainerTransform
 * -----------------------------------------------------------------------------------------------*/

const CONTAINER_NAME = "ContainerTransform";

type ScopedProps<P> = P & { __scopeContainer?: Scope };
const [createContainerContext, createContainerScope] = createContextScope(CONTAINER_NAME);

type TransformationRects = readonly [DOMRect | undefined, DOMRect | undefined]; // [trigger rect, Content rect]

interface ContainerTransformContextValue {
    triggerComputedStyleRef: React.RefObject<Partial<CSSStyleDeclaration>>;
    contentMaskRef: React.RefObject<HTMLDivElement>;
    transformOriginRef: React.RefObject<string>;
    active: boolean;
    onActiveChange(active: boolean): void;
    onActiveToggle(): void;
    rects: TransformationRects;
    onRectsChange(
        rects: (prevRects: TransformationRects | undefined) => TransformationRects | undefined
    ): void;
}

const [ContainerProvider, useContainerContext] =
    createContainerContext<ContainerTransformContextValue>(CONTAINER_NAME);

interface ContainerTransformProps extends React.PropsWithChildren {
    active?: boolean;
    defaultActive?: boolean;
    onActiveChange?(active: boolean): void;
}

const ContainerTransform: React.FC<ContainerTransformProps> = ({
    __scopeContainer,
    active,
    defaultActive,
    onActiveChange,
    children,
}: ScopedProps<ContainerTransformProps>) => {
    const triggerComputedStyleRef = React.useRef<Partial<CSSStyleDeclaration>>(
        {} as CSSStyleDeclaration
    );
    const contentMaskRef = React.useRef<HTMLDivElement | null>(null);
    const transformOriginRef = React.useRef("center");
    const [isActive = false, setIsActive] = useControllableState({
        prop: active,
        defaultProp: defaultActive,
        onChange: onActiveChange,
    });
    const stableRectsPlaceholderRef = React.useRef([undefined, undefined] as const).current;
    const [rects, setRects] = useControllableState<TransformationRects>({
        defaultProp: stableRectsPlaceholderRef,
    });

    return (
        <ContainerProvider
            scope={__scopeContainer}
            triggerComputedStyleRef={triggerComputedStyleRef}
            contentMaskRef={contentMaskRef}
            transformOriginRef={transformOriginRef}
            rects={rects || stableRectsPlaceholderRef}
            onRectsChange={setRects}
            active={isActive}
            onActiveChange={setIsActive}
            onActiveToggle={React.useCallback(
                () => setIsActive((prevState) => !prevState),
                [setIsActive]
            )}>
            {children}
        </ContainerProvider>
    );
};
ContainerTransform.displayName = CONTAINER_NAME;

/* -------------------------------------------------------------------------------------------------
 * ContainerTransformTrigger
 * -----------------------------------------------------------------------------------------------*/

const TRIGGER_NAME = "ContainerTransformTrigger";

type ContainerTransformTriggerElement = React.ElementRef<typeof Slot>;
type ContainerTransformTriggerProps = React.ComponentPropsWithoutRef<typeof Slot>;

const ContainerTransformTrigger = React.forwardRef<
    ContainerTransformTriggerElement,
    ScopedProps<ContainerTransformTriggerProps>
>(({ __scopeContainer, style, children, ...props }, forwardedRef) => {
    const context = useContainerContext(TRIGGER_NAME, __scopeContainer);
    const composedTriggerRef = useComposedRefs(forwardedRef);
    const styles: React.CSSProperties = { ...(context.active ? { opacity: 0 } : {}), ...style };

    return (
        <Slot
            {...props}
            ref={(node: HTMLElement | null) => {
                if (node) {
                    composedTriggerRef(node);
                    context.triggerComputedStyleRef.current = window.getComputedStyle(node);
                }
            }}
            style={styles}>
            <Slottable>{children}</Slottable>
            <div
                // This div is used to get the trigger position and size in an absolute position reference
                data-container-transform-trigger-mask=""
                ref={React.useCallback((node: HTMLDivElement | null) => {
                    if (node) {
                        context.contentMaskRef.current = node;
                        const clientRect = node.getBoundingClientRect();
                        // Find in which corner of the window the trigger is
                        context.transformOriginRef.current = getTransformOrigin(clientRect);
                        context.onRectsChange((prevRects) => [clientRect, prevRects?.[1]]);
                    }
                }, [])}
                style={visibleOnlyStyles}
                aria-hidden="true"
            />
        </Slot>
    );
});
ContainerTransformTrigger.displayName = TRIGGER_NAME;

/* -------------------------------------------------------------------------------------------------
 * ContainerTransformPortal
 * -----------------------------------------------------------------------------------------------*/

const PORTAL_NAME = "ContainerTransformPortal";

type ContainerTransformPortalElement = React.ElementRef<typeof Slot>;
interface ContainerTransformPortalProps extends React.ComponentPropsWithoutRef<typeof Slot> {
    /**
     * An optional container where the portaled content should be appended.
     */
    container?: HTMLElement | null;
}

const PortalPrimitive = React.forwardRef<
    ContainerTransformPortalElement,
    ContainerTransformPortalProps
>(({ container = globalThis?.document?.body, ...props }, forwardedRef) => {
    return container
        ? ReactDOM.createPortal(<Slot {...props} ref={forwardedRef} />, container)
        : null;
});
PortalPrimitive.displayName = PORTAL_NAME;

const ContainerTransformPortal: React.FC<ContainerTransformPortalProps> = React.forwardRef<
    ContainerTransformPortalElement,
    ScopedProps<ContainerTransformPortalProps>
>(({ __scopeContainer, container, children }, forwardedRef) => {
    // Guard against the case where the context is not available
    useContainerContext(PORTAL_NAME, __scopeContainer);
    return React.Children.map(children, (child) => (
        <PortalPrimitive container={container} ref={forwardedRef}>
            <LayoutGroup>{child}</LayoutGroup>
        </PortalPrimitive>
    ));
});
ContainerTransformPortal.displayName = PORTAL_NAME;

/* -------------------------------------------------------------------------------------------------
 * ContainerTransformContent
 * -----------------------------------------------------------------------------------------------*/

const MotionSlot = motion(Slot);

const CONTENT_NAME = "ContainerTransformContent";

const DISMISS_CONTENT_SWIPE_DISTANCE = 120;

type ContainerTransformContentElement = React.ElementRef<typeof MotionSlot>;
interface ContainerTransformContentProps extends React.ComponentPropsWithoutRef<typeof MotionSlot> {
    /**
     * Used to allow the user to dismiss the container transformation by swiping down.
     * Use it in conjunction with `onActiveChange`.
     * @default false
     */
    dismissOnSwipe?: boolean;
    /**
     * The direction in which the user can swipe to dismiss the container transformation.
     * @default "down"
     */
    swipeDirection?: "up" | "down" | "left" | "right" | "x" | "y" | "any";
}

const ContainerTransformContent = React.forwardRef<
    ContainerTransformContentElement,
    ScopedProps<ContainerTransformContentProps>
>(
    (
        {
            __scopeContainer,
            transition,
            dismissOnSwipe = false,
            swipeDirection = "down",
            style,
            children,
            ...props
        },
        forwardedRef
    ) => {
        const context = useContainerContext(CONTENT_NAME, __scopeContainer);
        const contentRef = React.useRef<ContainerTransformContentElement | null>(null);
        const composedRefs = useComposedRefs(forwardedRef, contentRef);
        const lastKnownContentBoundingClientRect = React.useRef<DOMRect | null>(null);
        const contentComputedStyleRef = React.useRef<Partial<CSSStyleDeclaration>>(
            {} as CSSStyleDeclaration
        );

        const styles: React.CSSProperties = {
            overflow: "hidden",
            position: "absolute",
            transformOrigin: context.transformOriginRef.current ?? "center",
            // left: 0,
            // top: 0,
            ...style,
        };

        useIsomorphicLayoutEffect(() => {
            const content = contentRef?.current;
            if (!isWindowDefined || !content || !context.active) {
                return;
            }
            context.onRectsChange((prevRects) => [
                prevRects?.[0],
                prevRects?.[1] ?? lastKnownContentBoundingClientRect.current ?? undefined,
            ]);
        }, [context.active]);

        // const animationKeyframes = {
        //     top: [initialTransitionProps.top, contentTransitionProps.top],
        //     left: [initialTransitionProps.left, contentTransitionProps.left],
        //     width: [initialTransitionProps.width, contentTransitionProps.width],
        //     height: [initialTransitionProps.height, contentTransitionProps.height],
        //     // transform: [initialTransitionProps.transform, contentTransitionProps.transform],
        //     x: [initialTransitionProps.x, contentTransitionProps.x],
        //     y: [initialTransitionProps.y, contentTransitionProps.y],
        //     padding: [initialTransitionProps.padding, contentTransitionProps.padding],
        //     backgroundColor: [
        //         initialTransitionProps.backgroundColor,
        //         contentTransitionProps.backgroundColor,
        //     ],
        //     borderRadius: [
        //         initialTransitionProps.borderRadius,
        //         contentTransitionProps.borderRadius,
        //     ],
        // } satisfies React.ComponentPropsWithoutRef<typeof motion.div>["animate"];

        const refHandler = React.useCallback(
            (node: HTMLElement | null) => {
                if (node) {
                    composedRefs(node);
                    contentComputedStyleRef.current = window.getComputedStyle(node);
                    if (!lastKnownContentBoundingClientRect.current)
                        lastKnownContentBoundingClientRect.current = node.getBoundingClientRect();
                }
                return () => context.onRectsChange((prevRects) => [prevRects?.[0], undefined]);
            },
            [composedRefs, context.onRectsChange]
        );

        /* -----------------------------------------------------------------------------------------------*/

        // const swipeConstraints = useSwipeConstraints(contentRef);

        // const checkSwipeToDismiss = React.useCallback(() => {
        //     const offset = context.rects[1]?.y;
        //     if (offset && dismissOnSwipe && offset > offset + DISMISS_CONTENT_SWIPE_DISTANCE) {
        //         context.onActiveToggle();
        //     }
        // }, [dismissOnSwipe]);

        const { height, width, x, y } = context.rects[0] ?? {};
        const {
            x: x2,
            y: y2,
            top,
            left,
            height: contentHeight,
            width: contentWidth,
        } = context.rects[1] ?? {};

        console.log(x2, y2, x, y);

        return (
            <AnimatePresence mode="wait">
                {context.active && (
                    <MotionSlot
                        {...props}
                        ref={refHandler}
                        layout="preserve-aspect"
                        layoutId="container-transform-content"
                        initial={{
                            height,
                            width,
                            // top: 0,
                            // left: 0 ,
                            x: x ? `${x}px` : undefined,
                            y: y ? `${y}px` : undefined,
                            padding: context.triggerComputedStyleRef.current?.padding ?? 0,
                            backgroundColor:
                                context.triggerComputedStyleRef.current?.backgroundColor ??
                                "rgb(0,0,0,0)",
                            borderRadius:
                                context.triggerComputedStyleRef.current?.borderRadius ?? 0,
                        }}
                        // animate={{
                        //     height: contentHeight,
                        //     width: contentHeight,
                        //     x: "-50%",
                        //     y: "-50%",
                        //     // top,
                        //     // left,
                        //     // x: x2,
                        //     // y: y2,
                        //     padding: contentComputedStyleRef.current.padding ?? 0,
                        //     backgroundColor:
                        //         contentComputedStyleRef.current.backgroundColor ?? "rgb(0,0,0,0)",
                        //     borderRadius: contentComputedStyleRef.current.borderRadius ?? 0,
                        // }}
                        exit={{
                            width,
                            height,
                            // x: `${context.rects[0]?.x ?? 0}px`,
                            // y: `${context.rects[0]?.y ?? 0}px`,
                            padding: context.triggerComputedStyleRef.current?.padding ?? 0,
                            backgroundColor:
                                context.triggerComputedStyleRef.current?.backgroundColor ??
                                "rgb(0,0,0,0)",
                            borderRadius:
                                context.triggerComputedStyleRef.current?.borderRadius ?? 0,
                        }}
                        // drag={dismissOnSwipe ? "y" : false}
                        // onDrag={checkSwipeToDismiss}
                        // dragConstraints={swipeConstraints}
                        // dragElastic={0.2}
                        style={styles}
                        transition={{
                            ease: EASINGS.emphasized,
                            duration: DURATIONS.emphasized,
                            backgroundColor: {
                                ease: EASINGS.emphasized_accelerate,
                                duration: DURATIONS.emphasized_accelerate,
                            },
                            ...transition,
                        }}>
                        <Slottable>{children}</Slottable>
                        <ContainerTransformContentMask
                            triggerBackgroundColor={
                                context.triggerComputedStyleRef.current?.backgroundColor
                            }
                            contentBackgroundColor={contentComputedStyleRef.current.backgroundColor}
                        />
                    </MotionSlot>
                )}
            </AnimatePresence>
        );
    }
);
ContainerTransformContent.displayName = CONTENT_NAME;

/* -------------------------------------------------------------------------------------------------
 * ContainerTransformContentMask
 * -----------------------------------------------------------------------------------------------*/

const CONTENT_MASK_NAME = "ContainerTransformContentMask";

const ContainerTransformContentMask = React.memo(
    ({
        triggerBackgroundColor,
        contentBackgroundColor,
    }: {
        triggerBackgroundColor: string | undefined | null;
        contentBackgroundColor: string | undefined | null;
    }) => {
        return (
            <motion.div
                key="container-transform-content-mask"
                data-container-transform-content-mask=""
                initial={{
                    opacity: 1,
                    backgroundColor: triggerBackgroundColor ?? "rgb(0,0,0,0)",
                }}
                animate={{
                    opacity: 0,
                    // @ts-ignore weird type error
                    backgroundColor: contentBackgroundColor ?? "rgb(0,0,0,0)",
                }}
                exit={{
                    opacity: 1,
                    // @ts-ignore weird type error
                    backgroundColor: triggerBackgroundColor ?? "rgb(0,0,0,0)",
                }}
                style={visibleOnlyStyles}
                transition={{
                    ease: EASINGS.emphasized,
                    duration: DURATIONS.emphasized,
                }}
                aria-hidden="true"
            />
        );
    }
);
ContainerTransformContentMask.displayName = CONTENT_MASK_NAME;

/* -----------------------------------------------------------------------------------------------*/

const getTransformOrigin = (rect: DOMRectReadOnly) => {
    const triggerCenterX = rect.left + rect.width / 2;
    const triggerCenterY = rect.top + rect.height / 2;
    const windowCenterX = window.innerWidth / 2;
    const windowCenterY = window.innerHeight / 2;
    const isTriggerOnTop = triggerCenterY < windowCenterY;
    const isTriggerOnLeft = triggerCenterX < windowCenterX;
    // TODO: refactor to use relative units instead of left/right/top/bottom values
    return `${isTriggerOnTop ? "top" : "bottom"} ${isTriggerOnLeft ? "left" : "right"}`;
};

/**
 * Calculate the top/bottom scroll constraints of a full-screen element vs the viewport
 */
function useSwipeConstraints(targetRef: React.RefObject<HTMLElement | SVGElement>) {
    const [constraints, setConstraints] = React.useState<{
        top: number;
        bottom: number;
        left: number;
        right: number;
    }>({
        left: 15,
        right: 15,
        bottom: 0,
        top: 0,
    });

    useIsomorphicLayoutEffect(() => {
        const element = targetRef.current as HTMLElement;
        if (!element) return;
        const viewportHeight = window.innerHeight;
        const contentTop = element.offsetTop;
        const scrollableViewport = viewportHeight - contentTop * 2;
        const contentHeight = element.offsetHeight;

        setConstraints((prevConstraints) => ({
            ...prevConstraints,
            top: Math.min(scrollableViewport - contentHeight, 0),
        }));
    }, [targetRef]);

    return constraints;
}

const Root = ContainerTransform;
const Trigger = ContainerTransformTrigger;
const Portal = ContainerTransformPortal;
const Content = ContainerTransformContent;

export {
    //
    ContainerTransform,
    ContainerTransformContent,
    ContainerTransformPortal,
    ContainerTransformTrigger,
    Content,
    Portal,
    //
    Root,
    Trigger,
    createContainerScope,
};

export type {
    ContainerTransformContentProps,
    ContainerTransformPortalProps,
    ContainerTransformProps,
    ContainerTransformTriggerProps,
};
