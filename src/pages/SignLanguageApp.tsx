import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { BookOpen, Hand, Sparkles } from "lucide-react";

import WebcamCapture from "@/components/sign-language/WebcamCapture";
import LearningMode from "@/components/sign-language/LearningMode";
import RecognitionMode from "@/components/sign-language/RecognitionMode";
import SignList from "@/components/sign-language/SignList";

// Constants for React Query
const SIGNS_QUERY_KEY = ['signs'];

/**
 * Main application component for the Haruki Sign Language Translator.
 * It orchestrates the webcam capture, real-time recognition, and sign language learning modes.
 */
export default function SignLanguageApp() {
  /**
   * State to control the visibility of the Learning Mode dialog.
   */
  const [showLearningMode, setShowLearningMode] = useState(false);
  /**
   * State to hold the latest detected landmarks from the webcam.
   */
  const [currentLandmarks, setCurrentLandmarks] = useState(null);
  
  const queryClient = useQueryClient();

  /**
   * Fetches the list of all sign language data from the backend.
   */
  const { data: signs = [], isLoading, error } = useQuery({
    queryKey: SIGNS_QUERY_KEY,
    queryFn: async () => {
      const data = await base44.entities.SignLanguage.list('-created_at');
      return data;
    },
    refetchOnMount: true,
    refetchOnWindowFocus: false,
    staleTime: 0, // Always fetch the latest data
    retry: 2,
  });

  /**
   * Mutation for deleting a sign language entry.
   * Invalidates the signs query on success to refetch the list.
   */
  const deleteMutation = useMutation({
    mutationFn: (id: string) => base44.entities.SignLanguage.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SIGNS_QUERY_KEY });
    },
  });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="container mx-auto px-4 py-8">
        <header className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4 relative">
            <div className="w-16 h-16 bg-gradient-to-br from-primary to-cyan-500 rounded-2xl flex items-center justify-center shadow-lg shadow-primary/30">
              <Hand className="w-9 h-9 text-primary-foreground" />
            </div>
            <Sparkles className="absolute -top-2 -right-2 w-6 h-6 text-cyan-400" />
          </div>
          <h1 className="text-4xl font-bold text-foreground mb-2">
            한국 수화 번역기
          </h1>
          <p className="text-muted-foreground text-lg">
            실시간 수화 인식 및 문장 생성
          </p>
        </header>

        <main className="max-w-6xl mx-auto">
          <div className="grid lg:grid-cols-3 gap-6 mb-6">
            <div className="lg:col-span-2">
              <WebcamCapture 
                onLandmarksDetected={setCurrentLandmarks}
                showLandmarks={true}
              />
            </div>
            <div>
              <RecognitionMode 
                currentLandmarks={currentLandmarks}
                signs={signs}
              />
            </div>
          </div>

          <div className="flex justify-center mb-6">
            <Dialog open={showLearningMode} onOpenChange={setShowLearningMode}>
              <DialogTrigger asChild>
                <Button 
                  size="lg"
                  className="bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/30"
                >
                  <BookOpen className="w-5 h-5 mr-2" />
                  수화 학습하기
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto bg-card border-border">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-2xl text-card-foreground">
                    <Hand className="w-6 h-6" />
                    학습 모드
                  </DialogTitle>
                </DialogHeader>
                <LearningMode signs={signs} />
              </DialogContent>
            </Dialog>
          </div>

          <SignList 
            signs={signs}
            isLoading={isLoading}
            error={error as Error | null}
            deleteMutation={deleteMutation}
          />
        </main>
      </div>
    </div>
  );
}