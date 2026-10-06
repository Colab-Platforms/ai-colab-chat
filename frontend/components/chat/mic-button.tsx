"use client";

import { useCallback, useEffect, useRef } from "react";
import { useSpeechRecognition } from "@/hooks/use-speech-recognition";
import { Button } from "@/components/ui/button";
import { Mic, Square } from "lucide-react";

interface MicButtonProps {
  onResult: (transcript: string) => void;
  onStart?: () => void;
  onStop?: () => void;
  hasText?: boolean; // used for mobile visibility control
  guideId?: string;
}

export function MicButton({ onResult, onStart, onStop, hasText, guideId }: MicButtonProps) {
  const onResultRef = useRef(onResult);
  const onStartRef = useRef(onStart);
  const onStopRef = useRef(onStop);

  useEffect(() => {
    onResultRef.current = onResult;
    onStartRef.current = onStart;
    onStopRef.current = onStop;
  }, [onResult, onStart, onStop]);

  const {
    transcript,
    interimTranscript,
    listening,
    browserSupportsSpeechRecognition,
    resetTranscript,
    startListening,
    stopListening,
  } = useSpeechRecognition();

  // Fire onResult whenever transcript changes - combine final + interim
  const prevRef = useRef("");
  useEffect(() => {
    let combined = transcript;
    if (interimTranscript) {
      if (combined && !combined.endsWith(" ") && !interimTranscript.startsWith(" ")) {
        combined += " ";
      }
      combined += interimTranscript;
    }
    combined = combined.trim();

    if (combined && combined !== prevRef.current) {
      prevRef.current = combined;
      onResultRef.current?.(combined);
    }
  }, [transcript, interimTranscript]);

  // Reset tracking when listening stops
  useEffect(() => {
    if (!listening) {
      prevRef.current = "";
    }
  }, [listening]);

  const handleClick = useCallback(() => {
    if (listening) {
      stopListening();
      resetTranscript();
      onStopRef.current?.();
    } else {
      resetTranscript();
      startListening();
      onStartRef.current?.();
    }
  }, [listening, resetTranscript, stopListening, startListening]);

  if (!browserSupportsSpeechRecognition) {
    return null; // Hide button if browser doesn't support it
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      className={`h-10 w-10 rounded-full transition-all duration-200 ${
        listening
          ? "text-white bg-destructive hover:bg-destructive/90 shadow-md animate-pulse"
          : "text-muted-foreground hover:bg-muted"
      }`}
      onClick={handleClick}
      title={listening ? "Stop listening" : "Start voice input"}
      data-guide={guideId}
    >
      {listening ? (
        <Square className="w-4 h-4 fill-current" />
      ) : (
        <Mic className="w-5 h-5" />
      )}
    </Button>
  );
}
