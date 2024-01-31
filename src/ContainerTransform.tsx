import { Slot, Slottable } from "@radix-ui/react-slot";
import { AnimatePresence, motion, useIsPresent } from "framer-motion";
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

const isWindowDefined = typeof window !== "undefined";
const useIsomorphicLayoutEffect = isWindowDefined ? React.useLayoutEffect : React.useEffect;

const visibleOnlyStyles = {
    pointerEvents: "none",
    position: "absolute",
    zIndex: 999,
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
} satisfies React.CSSProperties;

/* -------------------------------------------------------------------------------------------------
 * ContainerTransform
 * -----------------------------------------------------------------------------------------------*/

const CONTAINER_NAME = "ContainerTransform";

type ScopedProps<P> = P & { __scopeContainer?: Scope };
const [createContainerContext, createContainerScope] = createContextScope(CONTAINER_NAME);

type TransformationRects = readonly [DOMRect | undefined, DOMRect | undefined]; // [trigger rect, Content rect]

interface ContainerTransformContextValue {
    triggerRef: React.RefObject<ContainerTransformTriggerElement>;
    contentMaskRef: React.RefObject<HTMLDivElement>;
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
    const triggerRef = React.useRef<ContainerTransformTriggerElement>(null);
    const contentMaskRef = React.useRef<HTMLDivElement>(null);
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
            triggerRef={triggerRef}
            contentMaskRef={contentMaskRef}
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
    const composedTriggerRef = useComposedRefs(forwardedRef, context.triggerRef);
    const styles: React.CSSProperties = { ...(context.active ? { opacity: 0 } : {}), ...style };

    useIsomorphicLayoutEffect(() => {
        const contentMaskElement = context.contentMaskRef?.current;
        if (contentMaskElement)
            context.onRectsChange((prevRects) => [
                contentMaskElement.getBoundingClientRect(),
                prevRects?.[1],
            ]);
    }, [context.contentMaskRef]);

    return (
        <Slot {...props} ref={composedTriggerRef} style={styles}>
            <Slottable>{children}</Slottable>
            <div
                // This div is used to get the trigger position and size in an absolute position reference
                // getBoundingClientRect() doesn't seem reliable when the element is static
                data-container-transform-trigger-mask=""
                ref={context.contentMaskRef}
                style={visibleOnlyStyles}
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

const ContainerTransformPortal: React.FC<ContainerTransformPortalProps> = ({
    __scopeContainer,
    container,
    children,
}: ScopedProps<ContainerTransformPortalProps>) => {
    useContainerContext(PORTAL_NAME, __scopeContainer);
    return React.Children.map(children, (child) => (
        <PortalPrimitive container={container}>
            <AnimatePresence initial={false} mode="popLayout">
                {child}
            </AnimatePresence>
        </PortalPrimitive>
    ));
};
ContainerTransformPortal.displayName = PORTAL_NAME;

/* -----------------------------------------------------------------------------------------------*/

const MotionSlot = motion(Slot);

/* -------------------------------------------------------------------------------------------------
 * ContainerTransformContent
 * -----------------------------------------------------------------------------------------------*/

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
}

const ContainerTransformContent = React.forwardRef<
    ContainerTransformContentElement,
    ScopedProps<ContainerTransformContentProps>
>(
    (
        { __scopeContainer, transition, dismissOnSwipe = false, style, children, ...props },
        forwardedRef
    ) => {
        const context = useContainerContext(CONTENT_NAME, __scopeContainer);
        const contentRef = React.useRef<ContainerTransformContentElement>(null);
        const composedRefs = useComposedRefs(forwardedRef, contentRef);

        const [transformOrigin, setTransformOrigin] = React.useState("center");
        const [triggerComputedStyle, setTriggerComputedStyle] = React.useState<
            Partial<CSSStyleDeclaration>
        >(() => ({}) as CSSStyleDeclaration);
        const [contentComputedStyle, setContentComputedStyle] = React.useState<
            Partial<CSSStyleDeclaration>
        >(() => ({}) as CSSStyleDeclaration);

        useIsomorphicLayoutEffect(() => {
            const triggerElement = context.triggerRef.current;
            if (triggerElement) {
                setTriggerComputedStyle(window.getComputedStyle(triggerElement));
                // Find in which corner of the window the trigger is
                setTransformOrigin(getTransformOrigin(triggerElement.getBoundingClientRect()));
            }
            const contentElement = contentRef.current;
            if (contentElement) {
                setContentComputedStyle(window.getComputedStyle(contentElement));
                context.onRectsChange((prevRects) => [
                    prevRects?.[0],
                    contentElement.getBoundingClientRect(),
                ]);
            }
            return () => context.onRectsChange((prevRects) => [prevRects?.[0], undefined]);
        }, []);

        const swipeConstraints = useSwipeConstraints(contentRef);

        function checkSwipeToDismiss() {
            const contentElement = contentRef.current;
            if (!contentElement) return;
            const offset = contentElement.getBoundingClientRect().y;
            if (dismissOnSwipe && offset > offset + DISMISS_CONTENT_SWIPE_DISTANCE) {
                context.onActiveToggle();
            }
        }

        const initialTransitionProps = {
            // @ts-ignore weird type error
            top: 0,
            left: 0,
            width: context.rects[0]?.width,
            height: context.rects[0]?.height,
            transform: `translateX(${context.rects[0]?.x}px) translateY(${context.rects[0]?.y}px) translateY(0)`,
            padding: triggerComputedStyle.padding,
            backgroundColor: triggerComputedStyle.backgroundColor ?? "rgb(0,0,0,0)",
            borderRadius: triggerComputedStyle.borderRadius,
        } satisfies React.ComponentPropsWithoutRef<typeof motion.div>["initial"];

        const contentTransitionProps = {
            // @ts-ignore weird type error
            top: 0,
            left: 0,
            width: context.rects[1]?.width,
            height: context.rects[1]?.height,
            transform: `translateX(${context.rects[1]?.x}px) translateY(${context.rects[1]?.y}px) translateY(0)`,
            padding: contentComputedStyle.padding,
            backgroundColor: contentComputedStyle.backgroundColor ?? "rgb(0,0,0,0)",
            borderRadius: contentComputedStyle.borderRadius,
        } satisfies React.ComponentPropsWithoutRef<typeof motion.div>["animate"];

        const animationKeyframes = {
            // @ts-ignore weird type error
            top: [initialTransitionProps.top, contentTransitionProps.top],
            left: [initialTransitionProps.left, contentTransitionProps.left],
            width: [initialTransitionProps.width, contentTransitionProps.width],
            height: [initialTransitionProps.height, contentTransitionProps.height],
            transform: [initialTransitionProps.transform, contentTransitionProps.transform],
            padding: [initialTransitionProps.padding, contentTransitionProps.padding],
            backgroundColor: [
                initialTransitionProps.backgroundColor,
                contentTransitionProps.backgroundColor,
            ],
            borderRadius: [
                initialTransitionProps.borderRadius,
                contentTransitionProps.borderRadius,
            ],
        } satisfies React.ComponentPropsWithoutRef<typeof motion.div>["animate"];

        const styles = React.useMemo(
            () =>
                ({
                    transformOrigin,
                    overflow: "hidden",
                    position: "absolute",
                    ...style,
                }) as React.CSSProperties,
            [style, transformOrigin]
        );

        const hasValidContentRect =
            !!contentTransitionProps.width &&
            contentTransitionProps.width > 1 &&
            !!contentTransitionProps.height &&
            contentTransitionProps.height > 1;
        const canAnimate = useIsPresent() && hasValidContentRect;

        return (
            <MotionSlot
                {...props}
                ref={composedRefs}
                layout="preserve-aspect"
                layoutId="container-transform-content"
                layoutDependency={context.rects}
                animate={canAnimate && animationKeyframes}
                exit={initialTransitionProps}
                drag={dismissOnSwipe ? "y" : false}
                onDrag={checkSwipeToDismiss}
                dragConstraints={swipeConstraints}
                dragElastic={0.2}
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
                {canAnimate ? (
                    <ContainerTransformContentMask
                        triggerBackgroundColor={triggerComputedStyle.backgroundColor}
                        contentBackgroundColor={contentComputedStyle.backgroundColor}
                    />
                ) : null}
            </MotionSlot>
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
        triggerBackgroundColor: string | undefined;
        contentBackgroundColor: string | undefined;
    }) => {
        return (
            <motion.div
                key="container-transform-content-mask"
                data-container-transform-content-mask=""
                initial={{
                    opacity: 1,
                    // @ts-ignore weird type error
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

function getTransformOrigin(rect: DOMRectReadOnly) {
    const triggerCenterX = rect.left + rect.width / 2;
    const triggerCenterY = rect.top + rect.height / 2;
    const windowCenterX = window.innerWidth / 2;
    const windowCenterY = window.innerHeight / 2;
    const isTriggerOnTop = triggerCenterY < windowCenterY;
    const isTriggerOnLeft = triggerCenterX < windowCenterX;
    // TODO: refactor to use relative units instead of left/right/top/bottom values
    return `${isTriggerOnTop ? "top" : "bottom"} ${isTriggerOnLeft ? "left" : "right"}`;
}

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

    React.useEffect(() => {
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
    createContainerScope,
    //
    ContainerTransform,
    ContainerTransformTrigger,
    ContainerTransformPortal,
    ContainerTransformContent,
    //
    Root,
    Trigger,
    Portal,
    Content,
};

export type {
    ContainerTransformProps,
    ContainerTransformTriggerProps,
    ContainerTransformPortalProps,
    ContainerTransformContentProps,
};
